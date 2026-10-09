import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const NOW = new Date('2040-01-04T00:00:00Z');

describe.skipIf(!testDbUrl)('Discord 날짜별 비식별 활동 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let recordDailyActivity: typeof import('./daily-activity').recordDailyActivity;

  beforeAll(async () => {
    pool = await openTestDb();
    ({ recordDailyActivity } = await import('./daily-activity'));
    await pool.query(`delete from chat_messages where id like 'tda_%'`);
    await pool.query(`delete from discord_daily_activity where day between '2040-01-01' and '2040-01-03'`);
  });
  afterAll(async () => {
    await pool.query(`delete from chat_messages where id like 'tda_%'`);
    await pool.query(`delete from discord_daily_activity where day between '2040-01-01' and '2040-01-03'`);
    await pool.end();
  });

  it('한국 날짜로 세고, 재계산 시 중복하지 않으며, 60일 뒤 원본을 지워도 집계를 유지한다', async () => {
    await pool.query(`insert into chat_messages
      (id, channel_id, author_id, author_name, created_at, reactions, reply_to)
      values
      ('tda_1', 'tda_channel', 'tda_author_1', '테스트', '2040-01-01T23:30:00Z', 2, null),
      ('tda_2', 'tda_channel', 'tda_author_2', '테스트', '2040-01-02T01:00:00Z', 3, 'tda_1'),
      ('tda_3', 'tda_channel', 'tda_author_1', '테스트', '2040-01-02T16:00:00Z', 0, null)`);

    await recordDailyActivity(NOW);
    await recordDailyActivity(NOW);
    const rows = (await pool.query(`select day::text, messages, replies, reactions::int, active_authors
      from discord_daily_activity where day between '2040-01-01' and '2040-01-03' order by day`)).rows;
    expect(rows).toEqual([
      { day: '2040-01-02', messages: 2, replies: 1, reactions: 5, active_authors: 2 },
      { day: '2040-01-03', messages: 1, replies: 0, reactions: 0, active_authors: 1 },
    ]);
    await pool.query(`delete from chat_messages where id like 'tda_%'`);
    expect((await pool.query(`select messages from discord_daily_activity where day = '2040-01-02'`)).rows[0].messages).toBe(2);
  });
});
