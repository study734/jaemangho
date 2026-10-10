import { pool } from '../pool';
import { STEAM_NOTICE_VERSION, STEAM_STORAGE_COUNTRY } from './steam-policy';

export class SteamNoticeUnavailableError extends Error {}
export class SteamAccountNotVerifiedError extends Error {}

export async function getSteamActivitySettings(userId: string) {
  const accounts = (await pool.query<{
    steam_id: string; name: string; verified_at: Date; requested_at: Date | null;
    stopped_at: Date | null; last_success_at: Date | null; last_result: string | null;
  }>(`select v.steam_id, m.persona_name as name, v.verified_at,
      r.requested_at, r.stopped_at, s.last_success_at, s.last_result
    from steam_verified_accounts v
    join steam_members m on m.steam_id = v.steam_id
    left join steam_collection_requests r on r.steam_id = v.steam_id
    left join steam_collection_state s on s.steam_id = v.steam_id
    where v.user_id = $1 order by v.verified_at desc`, [userId])).rows;
  return {
    noticeVersion: STEAM_NOTICE_VERSION,
    storageCountry: STEAM_STORAGE_COUNTRY,
    accounts: accounts.map((row) => ({
      steamId: row.steam_id, name: row.name, verifiedAt: row.verified_at,
      requestedAt: row.requested_at, stoppedAt: row.stopped_at,
      lastSuccessAt: row.last_success_at, lastResult: row.last_result,
    })),
  };
}

export async function requestSteamActivity(userId: string, steamId: string, noticeVersion: string): Promise<boolean> {
  if (!STEAM_STORAGE_COUNTRY || noticeVersion !== STEAM_NOTICE_VERSION) throw new SteamNoticeUnavailableError();
  const client = await pool.connect();
  try {
    await client.query('begin');
    // 삭제와 재요청이 교차해 삭제 완료 후 요청행이 다시 생기는 일을 막는다.
    const verified = await client.query(`select v.steam_id from steam_verified_accounts v
      join steam_members m on m.steam_id = v.steam_id
      where v.steam_id = $1 and v.user_id = $2 and m.owner_id = $2
      for share of v`, [steamId, userId]);
    if (!verified.rowCount) {
      await client.query('rollback');
      return false;
    }
    await client.query(`insert into steam_collection_requests
      (steam_id, requested_by, notice_version, storage_country, requested_at, stopped_at)
      values ($1, $2, $3, $4, now(), null)
      on conflict (steam_id) do update set requested_by = excluded.requested_by,
        notice_version = excluded.notice_version, storage_country = excluded.storage_country,
        requested_at = excluded.requested_at, stopped_at = null`,
    [steamId, userId, noticeVersion, STEAM_STORAGE_COUNTRY]);
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function stopSteamActivity(userId: string, steamId: string): Promise<boolean> {
  const updated = await pool.query(`update steam_collection_requests r set stopped_at = now()
    where r.steam_id = $1 and r.requested_by = $2 and r.stopped_at is null
      and exists (select 1 from steam_verified_accounts v where v.steam_id = r.steam_id and v.user_id = $2)
    returning r.steam_id`, [steamId, userId]);
  return !!updated.rowCount;
}

// 삭제는 검증 연결과 장기 관측값을 함께 지운다. 공용 Steam 멤버는 기존 비교 기능을 위해 남긴다.
export async function eraseSteamActivity(userId: string, steamId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const owned = await client.query(`select steam_id from steam_verified_accounts
      where steam_id = $1 and user_id = $2 for update`, [steamId, userId]);
    if (!owned.rowCount) {
      await client.query('rollback');
      return false;
    }
    // 수집 중이면 완료를 기다린 뒤 지운다. 수집 측도 요청행 잠금을 잡아 삭제 후 재삽입을 막는다.
    await client.query('select steam_id from steam_collection_requests where steam_id = $1 for update', [steamId]);
    await client.query('delete from steam_playtime_changes where steam_id = $1', [steamId]);
    await client.query('delete from steam_game_totals where steam_id = $1', [steamId]);
    await client.query('delete from steam_collection_state where steam_id = $1', [steamId]);
    await client.query('delete from steam_collection_requests where steam_id = $1', [steamId]);
    await client.query('delete from steam_verified_accounts where steam_id = $1', [steamId]);
    await client.query('delete from steam_openid_challenges where user_id = $1', [userId]);
    await client.query(`delete from steam_cache where key = any($1)`, [[
      `/IPlayerService/GetOwnedGames/v1/?steamid=${steamId}&include_appinfo=1&include_played_free_games=1`,
      `/IPlayerService/GetRecentlyPlayedGames/v1/?steamid=${steamId}&count=0`,
    ]]);
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
