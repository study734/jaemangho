import { describe, expect, it, vi } from 'vitest';
import { fetchSteamConnections } from './discord-connections';

const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const ID = '76561198000000000';

describe('fetchSteamConnections', () => {
  it('Steam 연결만, 취소되지 않았고 17자리 ID인 것만 돌려준다', async () => {
    const fetchFn = reply([
      { id: ID, name: '철수', type: 'steam' },
      { id: '76561198000000001', name: '취소', type: 'steam', revoked: true },
      { id: 'abc', name: '이상한 ID', type: 'steam' },
      { id: ID.replace('0', '1'), name: '다른 서비스', type: 'twitch' },
    ]);
    expect(await fetchSteamConnections('tok', fetchFn)).toEqual([{ id: ID, name: '철수' }]);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('/users/@me/connections'), expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }));
  });

  it('권한이 없거나(403) 응답이 이상하거나 네트워크가 실패해도 던지지 않고 빈 목록', async () => {
    expect(await fetchSteamConnections('tok', reply({ message: 'Missing Access' }, 403))).toEqual([]);
    expect(await fetchSteamConnections('tok', reply({ not: 'an array' }))).toEqual([]);
    expect(await fetchSteamConnections('tok', vi.fn().mockRejectedValue(new Error('network')))).toEqual([]);
  });
});
