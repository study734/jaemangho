import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('Discord party store (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let store: typeof import('./party');
  const owner = '100000000000000003', friend = '100000000000000004';
  const party = { id: '200000000000000001', ownerId: owner, discordIds: [owner, friend], scope: 'any' as const, preference: 'recent' as const };
  const cleanup = () => pool.query(`delete from discord_parties where id like '2000000000000000%'`);
  beforeAll(async () => { pool = await openTestDb(); store = await import('./party'); await cleanup(); });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('saves idempotently and loads only for the owner', async () => {
    await store.saveParty(party);
    await store.saveParty({ ...party, discordIds: [friend, owner] });
    expect(await store.loadParty(party.id, owner)).toEqual(party);
    expect(await store.loadParty(party.id, friend)).toBeNull();
  });
  it('expires parties after a day and prunes them on the next save', async () => {
    await pool.query(`update discord_parties set created_at = now() - interval '25 hours' where id = $1`, [party.id]);
    expect(await store.loadParty(party.id, owner)).toBeNull();
    await store.saveParty({ ...party, id: '200000000000000002' });
    expect((await pool.query('select id from discord_parties where id = $1', [party.id])).rowCount).toBe(0);
  });
  it('rejects malformed rows at the schema level', async () => {
    await expect(store.saveParty({ ...party, id: '200000000000000003', discordIds: [owner] })).rejects.toThrow();
    await expect(pool.query(`insert into discord_parties (id, owner_discord_id, discord_ids, scope, preference) values ('x', $1, $2, 'all', 'balanced')`, [owner, [owner, friend]])).rejects.toThrow();
  });
});
