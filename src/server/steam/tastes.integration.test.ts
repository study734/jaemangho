import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';
import { emptyTaste } from '../../domain/steam-personal';

describe.skipIf(!testDbUrl)('explicit game tastes (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let store: typeof import('./tastes');
  const users = ['taste_test_one', 'taste_test_two'];
  const ids = ['76561190000000011', '76561190000000012'];
  beforeAll(async () => {
    pool = await openTestDb(); store = await import('./tastes');
    for (const [i, id] of users.entries()) {
      await pool.query(`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$1,$2,false,now(),now())`, [id, `${id}@test.invalid`]);
      await pool.query(`insert into steam_members(steam_id,persona_name,owner_id,created_by,created_by_name) values($1,$2,$2,$2,$2)`, [ids[i], id]);
    }
  });
  afterAll(async () => { await pool.query('delete from steam_members where steam_id=any($1)', [ids]); await pool.query('delete from "user" where id=any($1)', [users]); await pool.end(); });
  it('persists only explicit own input and drops legacy share/together keys', async () => {
    const profile = { ...emptyTaste(), likes: ['puzzle' as const] };
    await store.saveTaste(users[0], profile);
    expect(await store.readTaste(users[0])).toEqual(profile);
    expect(await store.readTaste(users[1])).toEqual(emptyTaste());
    await pool.query('update steam_tastes set profile=profile || $2::jsonb where user_id=$1', [users[0], JSON.stringify({ share: true, together: [{ appId: 620, steamIds: ids }] })]);
    expect(await store.readTaste(users[0])).toEqual(profile);
  });
  it('deletes only the caller\'s game tastes', async () => {
    await store.saveTaste(users[1], { ...emptyTaste(), likes: ['cooking'] });
    await store.deleteTaste(users[0]);
    expect(await store.readTaste(users[0])).toEqual(emptyTaste());
    expect((await store.readTaste(users[1])).likes).toEqual(['cooking']);
  });
});
