import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('agent preferences and shared admission (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let store: typeof import('./store');
  const ids = ['ai_store_one', 'ai_store_two'];
  beforeAll(async () => {
    pool = await openTestDb();
    store = await import('./store');
    for (const id of ids) await pool.query(`insert into "user"(id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $1, $2, false, now(), now()) on conflict(id) do nothing`, [id, `${id}@test.invalid`]);
  });
  beforeEach(async () => { await pool.query('truncate ai_requests, ai_model_calls, ai_provider_pause'); });
  afterAll(async () => {
    await pool.query('truncate ai_requests, ai_model_calls, ai_provider_pause');
    await pool.query('delete from "user" where id = any($1)', [ids]);
    await pool.end();
  });
  it('stores only explicit owner preferences and deletes them independently', async () => {
    await store.savePreference(ids[0], '협동 게임을 좋아해');
    expect(await store.readPreference(ids[0])).toBe('협동 게임을 좋아해');
    expect(await store.readPreference(ids[1])).toBe('');
    await store.savePreference(ids[0], '');
    expect(await store.readPreference(ids[0])).toBe('');
  });
  it('atomically admits at most two concurrent users and one request per user', async () => {
    const requests = await Promise.allSettled(['a', 'b', 'c', 'd'].map(id => store.acquireRequest(id)));
    const accepted = requests.filter(result => result.status === 'fulfilled');
    expect(accepted).toHaveLength(2);
    await expect(store.acquireRequest('a')).rejects.toMatchObject({ status: 429 });
    for (const result of accepted) if (result.status === 'fulfilled') await store.releaseRequest(result.value);
    const next = await store.acquireRequest('next');
    await store.releaseRequest(next);
  });
  it('bounds per-request inference, global minute use and day use before provider calls', async () => {
    const first = await store.acquireRequest('one');
    await store.chargeModelCall(first); await store.chargeModelCall(first);
    await expect(store.chargeModelCall(first)).rejects.toMatchObject({ status: 429 });
    await store.releaseRequest(first);
    await pool.query(`insert into ai_model_calls(request_id) select gen_random_uuid() from generate_series(1,8)`);
    const next = await store.acquireRequest('two');
    await expect(store.chargeModelCall(next)).rejects.toMatchObject({ status: 429 });
    await pool.query(`update ai_model_calls set called_at = now() - interval '1 hour'`);
    await pool.query(`insert into ai_model_calls(request_id, called_at) select gen_random_uuid(), now()-interval '1 hour' from generate_series(1,290)`);
    await expect(store.chargeModelCall(next)).rejects.toMatchObject({ status: 429 });
  });
  it('allows expired lease recovery, limits each user and shares the provider pause', async () => {
    const first = await store.acquireRequest('one');
    await pool.query(`update ai_requests set active_until = now()-interval '1 second' where id=$1`, [first]);
    const second = await store.acquireRequest('one'); await store.releaseRequest(second);
    const third = await store.acquireRequest('one'); await store.releaseRequest(third);
    await expect(store.acquireRequest('one')).rejects.toMatchObject({ status: 429 });
    await store.pauseProvider();
    await expect(store.acquireRequest('other')).rejects.toMatchObject({ status: 429 });
    await pool.query(`update ai_provider_pause set until_at = now()-interval '1 second'`);
    const after = await store.acquireRequest('other'); await store.releaseRequest(after);
  });
});
