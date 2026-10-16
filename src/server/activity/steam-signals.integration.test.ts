import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';
import { STEAM_NOTICE_VERSION } from './steam-policy';

describe.skipIf(!testDbUrl)('consented observed activity for recommendations', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let read: typeof import('./steam-signals').readSteamActivitySignals;
  const id = '76561193000000991';
  beforeAll(async () => {
    pool = await openTestDb(); ({ readSteamActivitySignals: read } = await import('./steam-signals'));
    await pool.query(`insert into "user"(id,name,email,"emailVerified") values('signal_9911','test','signal9911@test.invalid',false)`);
    await pool.query(`insert into steam_feature_consents(user_id,notice_version,storage_country) values('signal_9911','steam-common-v1','test')`);
    await pool.query(`insert into steam_members(steam_id,persona_name,owner_id) values($1,'test','signal_9911')`, [id]);
    await pool.query(`insert into steam_verified_accounts(steam_id,user_id) values($1,'signal_9911')`, [id]);
    await pool.query(`insert into steam_collection_requests(steam_id,requested_by,notice_version,requested_at) values($1,'signal_9911',$2,now())`, [id, STEAM_NOTICE_VERSION]);
    await pool.query(`insert into steam_playtime_changes(steam_id,app_id,previous_observed_at,observed_at,previous_minutes,minutes) values
      ($1,620,now()-interval '10 days',now()-interval '3 days',100,140),
      ($1,620,now()-interval '40 days',now()-interval '4 days',10,100)`, [id]);
  });
  afterAll(async () => {
    await pool.query('delete from steam_members where steam_id=$1', [id]);
    await pool.query(`delete from "user" where id='signal_9911'`); await pool.end();
  });
  it('selects only observed increases fully inside 30 days, with current consent and current ownership', async () => {
    expect(await read([])).toEqual(new Map());
    expect((await read([id])).get(id)).toEqual([{ appId: 620, minutes: 40 }]);
    await pool.query('update steam_collection_requests set stopped_at=now() where steam_id=$1', [id]);
    expect((await read([id])).size).toBe(0);
    await pool.query("update steam_collection_requests set stopped_at=null, notice_version='steam-activity-v1' where steam_id=$1", [id]);
    expect((await read([id])).size).toBe(0);
    await pool.query('update steam_collection_requests set notice_version=$2 where steam_id=$1', [id, STEAM_NOTICE_VERSION]);
    await pool.query('update steam_members set owner_id=null where steam_id=$1', [id]);
    expect((await read([id])).size).toBe(0);
  });
});
