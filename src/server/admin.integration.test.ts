import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('관리자 서비스 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let admin: typeof import('./admin');

  const addUser = (id: string, name: string, role: 'admin' | 'user' = 'user') =>
    pool.query(
      `insert into "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt") values ($1, $2, $3, false, $4, now(), now())`,
      [id, name, `${id}@test.invalid`, role]
    );
  const addSession = (id: string, userId: string) =>
    pool.query(`insert into session (id, token, "userId", "expiresAt", "createdAt", "updatedAt") values ($1, $1, $2, now() + interval '1 day', now(), now())`, [id, userId]);
  const cleanup = async () => {
    await pool.query(`delete from members where id like 'ta_%'`);
    await pool.query(`delete from "user" where id like 'ta_%'`); // session/account는 cascade
  };

  beforeAll(async () => {
    pool = await openTestDb();
    admin = await import('./admin');
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  describe('setBlocked', () => {
    it('일반 사용자를 차단하면 세션이 모두 지워지고, 해제하면 다시 차단할 수 있는 상태가 된다', async () => {
      await addUser('ta_user', '일반');
      await addSession('ta_s1', 'ta_user');
      await addSession('ta_s2', 'ta_user');

      expect(await admin.setBlocked('ta_user', true)).toBe(true);
      expect((await pool.query(`select banned from "user" where id = 'ta_user'`)).rows[0].banned).toBe(true);
      expect((await pool.query(`select count(*)::int as n from session where "userId" = 'ta_user'`)).rows[0].n).toBe(0);

      expect(await admin.setBlocked('ta_user', false)).toBe(true);
      expect((await pool.query(`select banned from "user" where id = 'ta_user'`)).rows[0].banned).toBe(false);
    });

    it('관리자는 차단할 수 없고 세션도 유지된다', async () => {
      await addUser('ta_admin', '관리자', 'admin');
      await addSession('ta_s3', 'ta_admin');
      expect(await admin.setBlocked('ta_admin', true)).toBe(false);
      expect((await pool.query(`select banned from "user" where id = 'ta_admin'`)).rows[0].banned).toBeFalsy();
      expect((await pool.query(`select count(*)::int as n from session where "userId" = 'ta_admin'`)).rows[0].n).toBe(1);
    });

    it('없는 사용자는 false', async () => {
      expect(await admin.setBlocked('ta_nobody', true)).toBe(false);
    });
  });

  it('listUsers: 관리자 여부, 차단 여부, 접속 정보를 돌려준다', async () => {
    const users = (await admin.listUsers()) as { id: string; isAdmin: boolean; blocked: boolean; loginCount: number }[];
    expect(users.find((u) => u.id === 'ta_admin')).toMatchObject({ isAdmin: true, blocked: false, loginCount: 0 });
    expect(users.find((u) => u.id === 'ta_user')).toMatchObject({ isAdmin: false, blocked: false });
  });

  it('listSummonersWithCreators: 등록자를 새 사용자 id, 예전 디스코드 ID, 저장된 이름 순으로 해석한다', async () => {
    await addUser('ta_creator', '새방식');
    await addUser('ta_legacy', '예전방식');
    await pool.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") values ('ta_acc', '555666777', 'discord', 'ta_legacy', now(), now())`);
    await pool.query(
      `insert into members (id, game_name, tag_line, created_by, created_by_name) values
       ('ta_m1', 'A', '1', 'ta_creator', '무시됨'),
       ('ta_m2', 'B', '2', '555666777', null),
       ('ta_m3', 'C', '3', '999', '저장된이름'),
       ('ta_m4', 'D', '4', '888', null)`
    );
    const rows = (await admin.listSummonersWithCreators()) as { id: string; createdByName: string | null }[];
    const nameOf = (id: string) => rows.find((r) => r.id === id)?.createdByName;
    expect(nameOf('ta_m1')).toBe('새방식');
    expect(nameOf('ta_m2')).toBe('예전방식');
    expect(nameOf('ta_m3')).toBe('저장된이름');
    expect(nameOf('ta_m4')).toBeNull();
  });

  it('purgeRiotCache: 지운 행 수를 돌려주고 캐시를 비운다', async () => {
    await pool.query(`delete from riot_cache`);
    await pool.query(`insert into riot_cache (key, status, body, expires_at) values ('ta_k1', 200, '{}', now() + interval '1 minute'), ('ta_k2', 200, '{}', now() + interval '1 minute')`);
    expect(await admin.purgeRiotCache()).toBe(2);
    expect((await pool.query(`select count(*)::int as n from riot_cache`)).rows[0].n).toBe(0);
  });

  it('getStatus: 요약 수치와 환경변수 점검 결과를 돌려준다', async () => {
    const s = await admin.getStatus();
    expect(s.counts).toMatchObject({ members: expect.any(Number), users: expect.any(Number), blocked: expect.any(Number), admins: expect.any(Number) });
    expect(s.database.bytes).toBeGreaterThan(0);
    expect(Array.isArray(s.envProblems)).toBe(true);
    expect(Array.isArray(s.stats)).toBe(true);
  });
});

describe('차단 요청 검증 (DB 불필요)', () => {
  it('올바른 요청만 통과한다', async () => {
    const { blockInputSchema } = await import('./admin');
    expect(blockInputSchema.safeParse({ id: 'abc-123', blocked: true }).success).toBe(true);
    expect(blockInputSchema.safeParse({ id: 'abc', blocked: 'yes' }).success).toBe(false);
    expect(blockInputSchema.safeParse({ id: '../etc', blocked: true }).success).toBe(false);
    expect(blockInputSchema.safeParse({ blocked: true }).success).toBe(false);
  });
});
