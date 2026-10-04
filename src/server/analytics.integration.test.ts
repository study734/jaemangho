import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('화면 열람 집계 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let analytics: typeof import('./analytics');
  const stat = async (path: string) => (await analytics.viewStats()).find((s) => s.path === path) ?? { path, today: 0, week: 0 };

  beforeAll(async () => {
    pool = await openTestDb();
    analytics = await import('./analytics');
  });
  afterAll(async () => {
    await pool.query(`delete from page_views where path = '/community' and views = 100`); // 아래에서 심은 오래된 행
    await pool.end();
  });

  it('열릴 때마다 오늘 횟수가 하나씩 늘고, 같은 화면은 한 행으로 합쳐진다', async () => {
    const before = await stat('/steam');
    await analytics.recordView('/steam');
    await analytics.recordView('/steam');
    await analytics.recordView('/steam');
    const after = await stat('/steam');
    expect(after.today - before.today).toBe(3);
    expect(after.week - before.week).toBe(3);
    const rows = await pool.query(`select count(*)::int as n from page_views where path = '/steam' and day = (now() at time zone 'Asia/Seoul')::date`);
    expect(rows.rows[0].n).toBe(1);
  });

  it('7일보다 오래된 기록은 7일 합계에 들어가지 않는다', async () => {
    const before = await stat('/community');
    await pool.query(`insert into page_views (day, path, views) values ((now() at time zone 'Asia/Seoul')::date - 8, '/community', 100) on conflict (day, path) do nothing`);
    expect((await stat('/community')).week).toBe(before.week);
  });

  it('표에는 날짜, 화면, 횟수만 있고 사용자를 식별할 수 있는 열은 없다', async () => {
    const cols = await pool.query(`select column_name from information_schema.columns where table_name = 'page_views' order by column_name`);
    expect(cols.rows.map((r) => r.column_name)).toEqual(['day', 'path', 'views']);
  });
});
