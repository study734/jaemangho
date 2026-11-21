import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

// intent/0004 R9·R10: 역할 설정 저장과 웹 로그인 판정(격리 DB, Discord는 fixture).
describe.skipIf(!testDbUrl)('사용 역할 (격리 DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let mr: typeof import('./member-role');
  const role = '100000000000000500', user = '100000000000000003', guild = '100000000000000002';
  const roles = (list: string[]) => vi.fn<typeof fetch>(async () => Response.json({ roles: list }));
  beforeAll(async () => { pool = await openTestDb(); mr = await import('./member-role'); });
  beforeEach(async () => { await pool.query('delete from discord_member_role'); });
  afterAll(async () => { await pool.query('delete from discord_member_role'); await pool.end(); });

  it('정하고 바꾸고 지울 수 있다', async () => {
    expect(await mr.memberRole()).toBeNull();
    await mr.setMemberRole(role, 'admin'); expect(await mr.memberRole()).toBe(role);
    await mr.setMemberRole('100000000000000501', 'admin'); expect(await mr.memberRole()).toBe('100000000000000501');
    await mr.setMemberRole(null, 'admin'); expect(await mr.memberRole()).toBeNull();
  });
  it('웹 로그인: 역할 미지정·서버 관리자는 조회 없이 통과, 지정되면 역할이 있어야 하고 조회 실패는 거부한다', async () => {
    const fetchFn = roles([]);
    expect(await mr.webLoginAllowed(user, false, { guildId: guild, token: 'bot', fetchFn })).toBe(true);
    await mr.setMemberRole(role, 'admin');
    expect(await mr.webLoginAllowed(user, true, { guildId: guild, token: 'bot', fetchFn })).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await mr.webLoginAllowed(user, false, { guildId: guild, token: 'bot', fetchFn: roles([role]) })).toBe(true);
    expect(await mr.webLoginAllowed(user, false, { guildId: guild, token: 'bot', fetchFn: roles(['100000000000000501']) })).toBe(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await mr.webLoginAllowed(user, false, { guildId: guild, token: undefined, fetchFn })).toBe(false);
  });
});
