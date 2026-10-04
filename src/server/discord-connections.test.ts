import { describe, expect, it, vi } from 'vitest';
import { type ConnectionHandler, fetchConnections, linkConnections } from './discord-connections';
import { parseRiotId } from './lol/connection';

const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('fetchConnections', () => {
  it('취소되지 않은 모든 연결을 종류와 함께 돌려준다', async () => {
    const fetchFn = reply([
      { id: '1', name: 'a', type: 'steam', verified: true },
      { id: '2', name: 'b', type: 'twitch' },
      { id: '3', name: 'c', type: 'steam', revoked: true },
    ]);
    expect(await fetchConnections('tok', fetchFn)).toEqual([
      { id: '1', name: 'a', type: 'steam' },
      { id: '2', name: 'b', type: 'twitch' },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('/users/@me/connections'), expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }));
  });

  it('권한이 없거나(403) 응답이 이상하거나 네트워크가 실패해도 던지지 않고 빈 목록', async () => {
    expect(await fetchConnections('tok', reply({ message: 'Missing Access' }, 403))).toEqual([]);
    expect(await fetchConnections('tok', reply({ not: 'an array' }))).toEqual([]);
    expect(await fetchConnections('tok', vi.fn().mockRejectedValue(new Error('network')))).toEqual([]);
  });
});

describe('linkConnections', () => {
  const conn = (type: string, name = 'n') => ({ id: `id-${type}`, name, type });
  const handler = (name: string, types: string[], link: ConnectionHandler['link'] = async () => {}): ConnectionHandler => ({ name, types, link: vi.fn(link) });

  it('아는 종류는 해당 처리기에 그 종류의 연결만 넘기고, 모르는 종류는 무시한다', async () => {
    const a = handler('a', ['steam']);
    const b = handler('b', ['riotgames', 'leagueoflegends']);
    await linkConnections('u1', [conn('steam'), conn('riotgames'), conn('leagueoflegends'), conn('twitch')], [a, b]);
    expect(a.link).toHaveBeenCalledWith('u1', [conn('steam')]);
    expect(b.link).toHaveBeenCalledWith('u1', [conn('riotgames'), conn('leagueoflegends')]);
  });

  it('연결이 없는 처리기는 부르지 않고, 한 처리기가 실패해도 나머지는 처리한다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = handler('failing', ['steam'], async () => {
      throw new Error('boom');
    });
    const ok = handler('ok', ['riotgames']);
    const idle = handler('idle', ['epicgames']);
    await expect(linkConnections('u1', [conn('steam'), conn('riotgames')], [failing, ok, idle])).resolves.toBeUndefined();
    expect(ok.link).toHaveBeenCalledTimes(1);
    expect(idle.link).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('로그에는 연결 종류만 남기고 계정 이름이나 id는 남기지 않는다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await linkConnections('u1', [{ id: '76561198000000000', name: '비밀닉네임', type: 'steam' }, { id: 'p1', name: 'Secret#KR1', type: 'xbox' }], [handler('s', ['steam'])]);
    const logged = info.mock.calls.flat().join(' ');
    expect(logged).toContain('discord connection types: steam,xbox; unhandled: xbox');
    expect(logged).not.toMatch(/비밀닉네임|Secret|7656119/);
    info.mockRestore();
  });
});

describe('parseRiotId', () => {
  it.each([
    ['Hide on bush#KR1', { gameName: 'Hide on bush', tagLine: 'KR1' }],
    [' Faker #KR1 ', { gameName: 'Faker', tagLine: 'KR1' }],
    ['그냥소환사명', null],
    ['Name#', null],
    ['#KR1', null],
  ])('%j', (name, expected) => expect(parseRiotId(name)).toEqual(expected));
});
