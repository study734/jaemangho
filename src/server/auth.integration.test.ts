import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

// DB가 필요한 통합 테스트: TEST_DATABASE_URL이 있을 때만 실행한다 (CI에서는 Postgres 서비스 컨테이너를 사용).
// 디스코드는 fetch를 가짜로 바꿔 대신하고, 로그인 라이브러리와 DB는 실제로 사용한다.

describe.skipIf(!testDbUrl)('디스코드 로그인 흐름 (getUserInfo -> 세션 훅 -> DB)', () => {
  type Mods = { auth: typeof import('./auth').auth; pool: Awaited<ReturnType<typeof openTestDb>> };
  let m: Mods;

  const discord = (opts: { member: boolean; permissions?: string; id?: string }) =>
    vi.stubGlobal('fetch', async (u: string) => {
      const body = String(u).endsWith('/users/@me')
        ? { id: opts.id ?? '777', username: 'tester', global_name: '테스터', avatar: null }
        : opts.member ? [{ id: 'G', owner: false, permissions: opts.permissions ?? '0' }] : [{ id: 'other' }];
      return { ok: true, status: 200, json: async () => body };
    });

  // 디스코드 로그인 콜백이 하는 일을 그대로 재현: getUserInfo -> (사용자/계정 생성 또는 조회) -> 세션 생성
  async function login(userId: string | null, discordId = '777') {
    const provider = m.auth.options.socialProviders!.discord!;
    const info = await provider.getUserInfo!({ accessToken: 'token' } as never);
    if (!info) return null;
    const ctx = await m.auth.$context;
    if (!userId) {
      const created = await ctx.internalAdapter.createOAuthUser(
        { name: info.user.name!, email: info.user.email!, emailVerified: false, image: null } as never,
        { accountId: discordId, providerId: 'discord' } as never
      );
      userId = created.user.id;
    }
    await ctx.internalAdapter.createSession(userId);
    return userId;
  }
  const row = async (id: string) => (await m.pool.query(`select * from "user" where id = $1`, [id])).rows[0];

  beforeAll(async () => {
    const pool = await openTestDb();
    m = { auth: (await import('./auth')).auth, pool };
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await m.pool.query(`delete from "user" where email like '%@discord.invalid'`); // account/session은 cascade
    await m.pool.end();
  });

  it('서버 멤버가 아니면 로그인을 거부한다', async () => {
    discord({ member: false });
    expect(await login(null)).toBeNull();
  });

  it('첫 로그인: 사용자와 디스코드 계정이 만들어지고 접속 기록이 남는다', async () => {
    discord({ member: true, permissions: '0' });
    const id = (await login(null))!;
    const u = await row(id);
    expect(u).toMatchObject({ name: '테스터', username: 'tester', role: 'user', loginCount: 1 });
    expect(u.lastLoginAt).toBeInstanceOf(Date);
    const account = await m.pool.query(`select "accountId", "providerId" from account where "userId" = $1`, [id]);
    expect(account.rows[0]).toEqual({ accountId: '777', providerId: 'discord' });
  });

  it('다시 로그인할 때마다 접속 횟수가 늘고, 디스코드 권한 변화(관리자 승격/해제)가 반영된다', async () => {
    const { rows } = await m.pool.query(`select "userId" from account where "accountId" = '777'`);
    const id = rows[0].userId as string;

    discord({ member: true, permissions: '8' }); // Administrator 권한을 받음
    await login(id);
    expect(await row(id)).toMatchObject({ role: 'admin', loginCount: 2 });

    discord({ member: true, permissions: '0' }); // 권한을 잃음
    await login(id);
    expect(await row(id)).toMatchObject({ role: 'user', loginCount: 3 });
  });

  it('차단된 사용자는 서버 멤버여도 로그인할 수 없고, 해제하면 다시 로그인할 수 있다', async () => {
    const { rows } = await m.pool.query(`select "userId" from account where "accountId" = '777'`);
    const id = rows[0].userId as string;
    discord({ member: true });

    await m.pool.query(`update "user" set banned = true where id = $1`, [id]);
    expect(await login(id)).toBeNull();

    await m.pool.query(`update "user" set banned = false where id = $1`, [id]);
    expect(await login(id)).toBe(id);
  });
});
