import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

// intent/0003 R1·R2·R3·R6
describe.skipIf(!testDbUrl)('디스코드 사용량 집계 (격리 DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let usage: typeof import('./usage');
  const a = '100000000000000091', b = '100000000000000092';
  const reset = async () => { await pool.query('delete from discord_usage'); await pool.query('delete from discord_usage_users'); await pool.query('delete from discord_usage_blocks'); };
  beforeAll(async () => { pool = await openTestDb(); usage = await import('./usage'); });
  beforeEach(reset);
  afterAll(async () => { await reset(); await pool.end(); });

  it('같은 사람은 하루 사용자 1명, 횟수·시간 합계·최대를 쌓고 영구 집계에는 ID가 없다', async () => {
    await usage.recordUsage('/게임추천', a, 1200);
    await usage.recordUsage('/게임추천', a, 3000);
    await usage.recordUsage('/게임추천', b, 300);
    await usage.recordUsage('/모집', a, 50);
    const rows = (await pool.query(`select action, uses, users, total_ms::int as total, max_ms as max from discord_usage order by action collate "C"`)).rows;
    expect(rows).toEqual([
      { action: '/게임추천', uses: 3, users: 2, total: 4500, max: 3000 },
      { action: '/모집', uses: 1, users: 1, total: 50, max: 50 },
    ]);
    expect(JSON.stringify((await pool.query('select * from discord_usage')).rows)).not.toContain(a);
  });
  it('동시에 같은 사람이 눌러도 하루 사용자는 1명이다', async () => {
    await Promise.all([1, 2, 3, 4].map(n => usage.recordUsage('/기록', a, n)));
    expect((await pool.query(`select uses, users from discord_usage where action = '/기록'`)).rows).toEqual([{ uses: 4, users: 1 }]);
  });
  it('최근 7일 상위 기능을 전주 대비 증감·하루 최대 사용자·평균 시간으로 보고한다', async () => {
    await pool.query(`insert into discord_usage (day, action, uses, users, total_ms, max_ms) values
      ((now() at time zone 'Asia/Seoul')::date, '/게임추천', 6, 3, 6000, 2000),
      ((now() at time zone 'Asia/Seoul')::date - 1, '/게임추천', 6, 5, 6000, 1500),
      ((now() at time zone 'Asia/Seoul')::date - 8, '/게임추천', 4, 2, 1000, 400),
      ((now() at time zone 'Asia/Seoul')::date - 2, '/의견', 1, 1, 30, 30),
      ((now() at time zone 'Asia/Seoul')::date - 9, '/모집', 3, 2, 90, 40)`);
    const report = await usage.usageReport();
    expect(report).toEqual([
      { action: '/게임추천', uses: 12, previous: 4, maxUsers: 5, avgMs: 1000 },
      { action: '/의견', uses: 1, previous: 0, maxUsers: 1, avgMs: 30 },
    ]);
  });
  it('전날보다 오래된 임시 ID와 365일 지난 집계를 지운다', async () => {
    await pool.query(`insert into discord_usage_users (day, action, discord_id) values
      ((now() at time zone 'Asia/Seoul')::date, '/기록', $1),
      ((now() at time zone 'Asia/Seoul')::date - 1, '/기록', $1),
      ((now() at time zone 'Asia/Seoul')::date - 2, '/기록', $1)`, [a]);
    await pool.query(`insert into discord_usage (day, action, uses, users, total_ms, max_ms) values
      ((now() at time zone 'Asia/Seoul')::date - 366, '/기록', 1, 1, 1, 1), ((now() at time zone 'Asia/Seoul')::date - 30, '/기록', 1, 1, 1, 1)`);
    await usage.purgeUsage();
    expect((await pool.query(`select count(*)::int as n from discord_usage_users`)).rows[0].n).toBe(2);
    expect((await pool.query(`select count(*)::int as n from discord_usage`)).rows[0].n).toBe(1);
  });
  it('막힌 이유를 하루 횟수·사용자 수로 세고 최근 7일을 이유별로 보고하며 ID는 영구 집계에 없다 (2번)', async () => {
    await usage.recordBlock('no_role', a);
    await usage.recordBlock('no_role', a);
    await usage.recordBlock('no_role', b);
    await usage.recordBlock('friend_unlinked', a);
    await pool.query(`insert into discord_usage_blocks (day, reason, uses, users) values
      ((now() at time zone 'Asia/Seoul')::date - 3, 'no_role', 4, 4), ((now() at time zone 'Asia/Seoul')::date - 8, 'steam_login', 9, 9)`);
    expect(await usage.blockReport()).toEqual([
      { reason: 'no_role', uses: 7, maxUsers: 4 },
      { reason: 'friend_unlinked', uses: 1, maxUsers: 1 },
    ]);
    expect(JSON.stringify((await pool.query('select * from discord_usage_blocks')).rows)).not.toContain(a);
  });
});
