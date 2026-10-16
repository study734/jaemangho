import { pool } from '../pool';
import { requireUser } from '../viewer';
import { serverError } from '../http';
import { STEAM_NOTICE_VERSION, STEAM_STORAGE_COUNTRY } from '../activity/steam-policy';

export const STEAM_FEATURE_NOTICE = 'steam-common-v1';

export async function hasSteamConsent(userId: string) {
  const result = await pool.query(`select 1 from steam_feature_consents
    where user_id=$1 and notice_version=$2 and revoked_at is null`, [userId, STEAM_FEATURE_NOTICE]);
  return !!result.rowCount;
}

export async function requireSteamUser() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    return await hasSteamConsent(user.id) ? user : Response.json({ error: 'Steam 공통 게임 이용 동의가 필요해요.', code: 'steam_consent_required' }, { status: 403 });
  } catch (error) { return serverError(error, 'steam.consent.check'); }
}

// One explicit feature agreement authorizes recommendation data use. Long-term
// collection is still restricted to Steam-verified accounts currently owned by
// the actor. Other people's Steam accounts are never enrolled by this action.
export async function acceptSteamConsent(userId: string, version: string): Promise<string[]> {
  if (version !== STEAM_FEATURE_NOTICE || !STEAM_STORAGE_COUNTRY) throw new Error('steam_notice_changed');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`insert into steam_feature_consents(user_id,notice_version,storage_country)
      values($1,$2,$3) on conflict(user_id) do update set notice_version=excluded.notice_version,
      storage_country=excluded.storage_country, accepted_at=now(), revoked_at=null`, [userId, version, STEAM_STORAGE_COUNTRY]);
    const accounts = await client.query<{ steam_id: string }>(`select v.steam_id from steam_verified_accounts v
      join steam_members m on m.steam_id=v.steam_id and m.owner_id=v.user_id where v.user_id=$1 for share of v`, [userId]);
    for (const { steam_id: id } of accounts.rows) await client.query(`insert into steam_collection_requests
      (steam_id,requested_by,notice_version,storage_country,requested_at,stopped_at) values($1,$2,$3,$4,now(),null)
      on conflict(steam_id) do update set requested_by=excluded.requested_by, notice_version=excluded.notice_version,
      storage_country=excluded.storage_country, requested_at=now(), stopped_at=null`, [id, userId, STEAM_NOTICE_VERSION, STEAM_STORAGE_COUNTRY]);
    await client.query('commit');
    return accounts.rows.map(row => row.steam_id);
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

export async function revokeSteamConsent(userId: string) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('update steam_feature_consents set revoked_at=now() where user_id=$1', [userId]);
    await client.query('update steam_collection_requests set stopped_at=now() where requested_by=$1 and stopped_at is null', [userId]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
