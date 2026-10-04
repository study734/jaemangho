import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('홈 피드 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let home: typeof import('./home');
  const cleanup = async () => {
    await pool.query(`delete from members where id like 'th_%'`);
    await pool.query(`delete from steam_members where steam_id like '7656119100000000_'`);
    await pool.query(`delete from "user" where id like 'th_%'`);
  };

  beforeAll(async () => {
    pool = await openTestDb();
    home = await import('./home');
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('소환사·Steam 등록과 접속을 합쳐 최신순으로 돌려주고, 차단된 사용자는 뺀다', async () => {
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified", banned, "lastLoginAt", "createdAt", "updatedAt") values
       ('th_a', '홈철수', 'th_a@test.invalid', false, false, now() + interval '3 minutes', now(), now()),
       ('th_b', '홈차단', 'th_b@test.invalid', false, true, now() + interval '4 minutes', now(), now())`
    );
    await pool.query(`insert into members (id, game_name, tag_line, created_by_name, created_at) values ('th_m', 'HomeFaker', 'KR1', '홈영희', now() + interval '2 minutes')`);
    await pool.query(`insert into steam_members (steam_id, persona_name, created_by_name, created_at) values ('76561191000000001', '홈스팀', '홈영희', now() + interval '1 minute')`);

    const { activity, people } = await home.getHomeFeed();
    const mine = activity.filter((a) => ['홈철수', 'HomeFaker#KR1', '홈스팀', '홈차단'].some((t) => a.actor === t || a.target === t));
    expect(mine.map((a) => [a.kind, a.actor, a.target])).toEqual([
      ['login', '홈철수', ''],
      ['lol', '홈영희', 'HomeFaker#KR1'],
      ['steam', '홈영희', '홈스팀'],
    ]);
    expect(people.some((p) => p.name === '홈차단')).toBe(false);
    expect(people.some((p) => p.name === '홈철수')).toBe(true);
  });
});
