import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

// intent/0005 R5: 같은 친구에게 6시간에 한 번만 알린다.
describe.skipIf(!testDbUrl)('연결 안 된 친구 알림 제한 (격리 DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let nudge: typeof import('./nudge');
  const a = '100000000000000201', b = '100000000000000202';
  beforeAll(async () => { pool = await openTestDb(); nudge = await import('./nudge'); });
  beforeEach(async () => { await pool.query('delete from discord_nudges'); });
  afterAll(async () => { await pool.query('delete from discord_nudges'); await pool.end(); });

  it('처음은 알리고, 6시간 안에 다시 누르면 이미 알린 친구는 빼며, 지나면 다시 알린다', async () => {
    expect((await nudge.claimNudges([a])).sort()).toEqual([a]);
    expect((await nudge.claimNudges([a, b])).sort()).toEqual([b]);
    expect(await nudge.claimNudges([a, b])).toEqual([]);
    await pool.query(`update discord_nudges set nudged_at = now() - interval '7 hours' where discord_id = $1`, [a]);
    expect(await nudge.claimNudges([a, b])).toEqual([a]);
  });
  it('동시에 눌러도 한 번만 알리고, 하루 지난 기록은 지운다', async () => {
    const results = await Promise.all([1, 2, 3].map(() => nudge.claimNudges([a])));
    expect(results.flat()).toEqual([a]);
    await pool.query(`insert into discord_nudges (discord_id, nudged_at) values ($1, now() - interval '2 days')`, [b]);
    await nudge.claimNudges([a]);
    expect((await pool.query('select discord_id from discord_nudges')).rows).toEqual([{ discord_id: a }]);
  });
});
