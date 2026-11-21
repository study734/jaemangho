import { describe, expect, it, vi } from 'vitest';
import { fetchMemberRoles, roleAllows } from './member-role';

// intent/0004 R8·R10: 역할 판정과 봇 토큰 역할 조회(DB 없음).
const role = '100000000000000500', user = '100000000000000003', guild = '100000000000000002';

describe('roleAllows', () => {
  it('역할을 정하지 않았으면 모두, 정했으면 그 역할이 있거나 서버 관리자만 허용한다', () => {
    expect(roleAllows(null, [], false)).toBe(true);
    expect(roleAllows(role, [role], false)).toBe(true);
    expect(roleAllows(role, ['100000000000000501'], false)).toBe(false);
    expect(roleAllows(role, [], true)).toBe(true);
  });
});

describe('fetchMemberRoles', () => {
  it('봇 토큰으로 서버 멤버의 역할을 읽는다', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ roles: [role, 'bad'] }));
    expect(await fetchMemberRoles(user, guild, 'bot', fetchFn)).toEqual([role]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://discord.com/api/v10/guilds/${guild}/members/${user}`);
    expect(init).toMatchObject({ headers: { Authorization: 'Bot bot' } });
  });
  it('토큰이 없거나 조회가 실패하면 null(로그인 거부)이고 상태 코드만 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await fetchMemberRoles(user, guild, undefined, vi.fn())).toBeNull();
    expect(await fetchMemberRoles(user, guild, 'secret-token', vi.fn<typeof fetch>(async () => new Response('{}', { status: 404 })))).toBeNull();
    expect(await fetchMemberRoles(user, guild, 'secret-token', vi.fn<typeof fetch>(async () => { throw new Error('net'); }))).toBeNull();
    expect(await fetchMemberRoles(user, guild, 'secret-token', vi.fn<typeof fetch>(async () => Response.json({ roles: 'x' })))).toBeNull();
    expect(JSON.stringify(log.mock.calls)).toContain('404');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
  });
});
