import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('mandatory Steam feature consent', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>, consent: typeof import('./consent');
  const user = 'steam_consent_9911', ids = ['76561190000009911', '76561190000009912'];
  beforeAll(async () => {
    pool = await openTestDb(); consent = await import('./consent');
    await pool.query(`insert into "user"(id,name,email,"emailVerified") values($1,'test','consent9911@test.invalid',false)`, [user]);
    for (const id of ids) await pool.query(`insert into steam_members(steam_id,persona_name,owner_id) values($1,'test',$2)`, [id, user]);
    await pool.query('insert into steam_verified_accounts(steam_id,user_id) values($1,$2)', [ids[0], user]);
  });
  afterAll(async () => {
    await pool.query('delete from steam_members where steam_id=any($1)', [ids]);
    await pool.query('delete from "user" where id=$1', [user]); await pool.end();
  });
  it('requires the current explicit notice and only enrolls verified own accounts', async () => {
    expect(await consent.hasSteamConsent(user)).toBe(false);
    await expect(consent.acceptSteamConsent(user, 'old-notice')).rejects.toThrow();
    expect(await consent.acceptSteamConsent(user, consent.STEAM_FEATURE_NOTICE)).toEqual([ids[0]]);
    expect(await consent.hasSteamConsent(user)).toBe(true);
    expect((await pool.query('select steam_id from steam_collection_requests where requested_by=$1', [user])).rows.map(row => row.steam_id)).toEqual([ids[0]]);
    await consent.revokeSteamConsent(user);
    expect(await consent.hasSteamConsent(user)).toBe(false);
    expect((await pool.query('select stopped_at is not null as stopped from steam_collection_requests where steam_id=$1', [ids[0]])).rows[0].stopped).toBe(true);
    await consent.acceptSteamConsent(user, consent.STEAM_FEATURE_NOTICE);
    expect(await consent.hasSteamConsent(user)).toBe(true);
    expect((await pool.query('select count(*)::int as n from steam_feature_consents where user_id=$1', [user])).rows[0].n).toBe(1);
  });
});
