import { pool } from '../pool';

export interface SteamGameTotal {
  appId: number;
  minutes: number;
}

// 첫 응답은 기준선이다. 증가분만 장기 기록하며 성공 응답에 없는 게임은 건드리지 않는다.
export async function recordSteamObservation(steamId: string, games: SteamGameTotal[], observedAt: Date): Promise<number> {
  if (Number.isNaN(observedAt.getTime()) || new Set(games.map((game) => game.appId)).size !== games.length) {
    throw new Error('Invalid Steam observation');
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`steam-observation:${steamId}`]);
    const request = (await client.query(
      `select 1 from steam_collection_requests r
       join steam_members m on m.steam_id = r.steam_id
       where r.steam_id = $1 and r.stopped_at is null and r.requested_by = m.owner_id`, [steamId],
    )).rowCount;
    if (!request) throw new Error('Steam collection was not requested by this account');

    let changes = 0;
    for (const game of games) {
      if (!Number.isSafeInteger(game.appId) || game.appId <= 0 || !Number.isSafeInteger(game.minutes) || game.minutes < 0) {
        throw new Error('Invalid Steam game total');
      }
      const previous = (await client.query<{ minutes: string; observed_at: Date }>(
        'select minutes, observed_at from steam_game_totals where steam_id = $1 and app_id = $2',
        [steamId, game.appId],
      )).rows[0];
      if (previous && observedAt <= previous.observed_at) continue;
      if (previous && BigInt(game.minutes) > BigInt(previous.minutes)) {
        await client.query(`insert into steam_playtime_changes
          (steam_id, app_id, previous_observed_at, observed_at, previous_minutes, minutes)
          values ($1, $2, $3, $4, $5, $6)
          on conflict (steam_id, app_id, observed_at) do nothing`,
        [steamId, game.appId, previous.observed_at, observedAt, previous.minutes, game.minutes]);
        changes++;
      }
      await client.query(`insert into steam_game_totals (steam_id, app_id, minutes, observed_at)
        values ($1, $2, $3, $4)
        on conflict (steam_id, app_id) do update
          set minutes = excluded.minutes, observed_at = excluded.observed_at`,
      [steamId, game.appId, game.minutes, observedAt]);
    }
    await client.query('commit');
    return changes;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
