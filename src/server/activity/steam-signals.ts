import { pool } from '../pool';
import type { RecentGame } from '../steam/client';
import { STEAM_NOTICE_VERSION } from './steam-policy';
import { STEAM_FEATURE_NOTICE } from '../steam/consent';

// Observed increases are not exact play-session times. Only intervals fully
// inside the last 30 days are used. Stopped, deleted or reassigned data is excluded.
export async function readSteamActivitySignals(ids: string[]): Promise<Map<string, RecentGame[]>> {
  const result = await pool.query<{ steam_id: string; app_id: number; minutes: string }>(`select c.steam_id, c.app_id,
      sum(c.minutes-c.previous_minutes)::text as minutes
    from steam_playtime_changes c
    join steam_collection_requests r on r.steam_id=c.steam_id and r.stopped_at is null
    join steam_members m on m.steam_id=r.steam_id and m.owner_id=r.requested_by
    join steam_verified_accounts v on v.steam_id=r.steam_id and v.user_id=r.requested_by
    join steam_feature_consents f on f.user_id=r.requested_by and f.notice_version=$3 and f.revoked_at is null
    where c.steam_id=any($1) and r.notice_version=$2 and c.previous_observed_at >= now()-interval '30 days'
      and c.observed_at <= now()
    group by c.steam_id, c.app_id`, [ids, STEAM_NOTICE_VERSION, STEAM_FEATURE_NOTICE]);
  const signals = new Map<string, RecentGame[]>();
  for (const row of result.rows) {
    const games = signals.get(row.steam_id) ?? [];
    games.push({ appId: row.app_id, minutes: Number(row.minutes) });
    signals.set(row.steam_id, games);
  }
  return signals;
}
