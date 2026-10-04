import { describe, expect, it, vi } from 'vitest';
import { fetchConnections } from './discord-connections';

const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const ID = '76561198000000000';

describe('fetchConnections', () => {
  it('Steam 연결만, 취소되지 않았고 17자리 ID인 것만 돌려준다', async () => {
    const fetchFn = reply([
      { id: ID, name: '철수', type: 'steam' },
      { id: '76561198000000001', name: '취소', type: 'steam', revoked: true },
      { id: 'abc', name: '이상한 ID', type: 'steam' },
      { id: ID.replace('0', '1'), name: '다른 서비스', type: 'twitch' },
    ]);
    expect((await fetchConnections('tok', fetchFn)).steam).toEqual([{ id: ID, name: '철수' }]);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('/users/@me/connections'), expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }));
  });

  it('권한이 없거나(403) 응답이 이상하거나 네트워크가 실패해도 던지지 않고 빈 목록', async () => {
    expect(await fetchConnections('tok', reply({ message: 'Missing Access' }, 403))).toEqual({ steam: [], riot: [] });
    expect(await fetchConnections('tok', reply({ not: 'an array' }))).toEqual({ steam: [], riot: [] });
    expect(await fetchConnections('tok', vi.fn().mockRejectedValue(new Error('network')))).toEqual({ steam: [], riot: [] });
  });
});

describe('fetchConnections: Riot', () => {
  it('Riot 연결은 이름이 게임이름#태그로 읽힐 때만 받아들인다 (취소된 연결 제외)', async () => {
    const fetchFn = reply([
      { id: 'p1', name: 'Hide on bush#KR1', type: 'riotgames' },
      { id: 'p2', name: '그냥소환사명', type: 'riotgames' },
      { id: 'p3', name: 'Old#KR1', type: 'riotgames', revoked: true },
      { id: 'p4', name: 'Other#EUW', type: 'leagueoflegends' },
      { id: 'p5', name: 'Nope#KR1', type: 'twitch' },
    ]);
    expect((await fetchConnections('tok', fetchFn)).riot).toEqual([
      { gameName: 'Hide on bush', tagLine: 'KR1' },
      { gameName: 'Other', tagLine: 'EUW' },
    ]);
  });

  it('로그에는 연결 종류 이름만 남기고 계정 이름이나 id는 남기지 않는다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await fetchConnections('tok', reply([{ id: ID, name: '비밀닉네임', type: 'steam' }, { id: 'p1', name: 'Secret#KR1', type: 'riotgames' }]));
    const logged = info.mock.calls.flat().join(' ');
    expect(logged).toContain('riotgames,steam');
    expect(logged).not.toMatch(/비밀닉네임|Secret|7656119/);
    info.mockRestore();
  });
});
