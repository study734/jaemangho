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
  for (const game of games) {
    if (!Number.isSafeInteger(game.appId) || game.appId <= 0 || game.appId > 2147483647 ||
        !Number.isSafeInteger(game.minutes) || game.minutes < 0) throw new Error('Invalid Steam game total');
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`steam-observation:${steamId}`]);
    const request = (await client.query(
      `select 1 from steam_collection_requests r
       join steam_members m on m.steam_id = r.steam_id
       join steam_verified_accounts v on v.steam_id = r.steam_id and v.user_id = r.requested_by
       join "user" u on u.id = r.requested_by and not coalesce(u.banned, false)
       where r.steam_id = $1 and r.stopped_at is null and r.requested_by = m.owner_id
       for share of r`, [steamId],
    )).rowCount;
    if (!request) throw new Error('Steam collection was not requested by this account');

    const previousRows = await client.query<{ app_id: number; minutes: string; observed_at: Date }>(
      'select app_id, minutes, observed_at from steam_game_totals where steam_id = $1 and app_id = any($2::integer[])',
      [steamId, games.map((game) => game.appId)],
    );
    const previousById = new Map(previousRows.rows.map((row) => [row.app_id, row]));
    const fresh = games.filter((game) => {
      const previous = previousById.get(game.appId);
      return !previous || observedAt > previous.observed_at;
    });
    const increased = fresh.filter((game) => {
      const previous = previousById.get(game.appId);
      return previous && BigInt(game.minutes) > BigInt(previous.minutes);
    });
    let changes = 0;
    if (increased.length) {
      const inserted = await client.query(`insert into steam_playtime_changes
        (steam_id, app_id, previous_observed_at, observed_at, previous_minutes, minutes)
        select $1, app_id, previous_at, $2, previous_minutes, minutes
        from unnest($3::integer[], $4::timestamptz[], $5::bigint[], $6::bigint[])
          as batch(app_id, previous_at, previous_minutes, minutes)
        on conflict (steam_id, app_id, observed_at) do nothing`,
      [steamId, observedAt, increased.map((game) => game.appId),
        increased.map((game) => previousById.get(game.appId)!.observed_at),
        increased.map((game) => previousById.get(game.appId)!.minutes), increased.map((game) => game.minutes)]);
      changes = inserted.rowCount ?? 0;
    }
    if (fresh.length) {
      await client.query(`insert into steam_game_totals (steam_id, app_id, minutes, observed_at)
        select $1, app_id, minutes, $2 from unnest($3::integer[], $4::bigint[]) as batch(app_id, minutes)
        on conflict (steam_id, app_id) do update
          set minutes = excluded.minutes, observed_at = excluded.observed_at`,
      [steamId, observedAt, fresh.map((game) => game.appId), fresh.map((game) => game.minutes)]);
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
