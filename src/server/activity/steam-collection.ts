import { randomUUID } from 'node:crypto';
import { pool } from '../pool';
import { getLibrary, SteamNotConfiguredError, SteamPayloadError, SteamUpstreamError, type Library } from '../steam/client';
import { recordSteamObservation } from './steam-facts';

const WEEK_MS = 7 * 86_400_000;
const JOB = 'steam_activity';
const MAX_ACCOUNTS = 20;

export class SteamCollectionBusyError extends Error {}

export interface SteamCollectionOptions {
  now?: Date;
  maxAccounts?: number;
  budgetMs?: number;
  fetchLibrary?: (steamId: string) => Promise<Library>;
}

function errorCode(error: unknown): string {
  if (error instanceof SteamNotConfiguredError) return 'not_configured';
  if (error instanceof SteamPayloadError) return 'invalid_response';
  if (error instanceof SteamUpstreamError) return `upstream_${error.status}`;
  return 'collection_failed';
}

// 호출 경로와 예약 작업은 아직 연결하지 않는다. 요청행과 roster owner_id 일치만 확인하며,
// 실제 Steam 계정 주인 검증은 활성화 전에 별도로 마련해야 한다.
export async function runSteamCollection(source: 'scheduled' | 'manual', options: SteamCollectionOptions = {}) {
  const { now = new Date(), maxAccounts = MAX_ACCOUNTS, budgetMs = 45_000, fetchLibrary = getLibrary } = options;
  if (!Number.isInteger(maxAccounts) || maxAccounts < 1 || maxAccounts > MAX_ACCOUNTS) throw new Error('Invalid account limit');
  const started = Date.now();
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [727276]);
    await client.query(`update ops_jobs set status = 'failed', error_code = 'interrupted', finished_at = now()
      where job = $1 and status = 'running' and started_at < now() - interval '5 minutes'`, [JOB]);
    const inserted = await client.query(`insert into ops_jobs (id, job, source, status)
      values ($1, $2, $3, 'running') on conflict (job) where status = 'running' do nothing returning id`,
    [id, JOB, source]);
    await client.query('commit');
    if (!inserted.rowCount) throw new SteamCollectionBusyError();
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  try {
    const dueBefore = new Date(now.getTime() - WEEK_MS);
    const eligible = (await pool.query<{ steam_id: string }>(`select r.steam_id
      from steam_collection_requests r
      join steam_members m on m.steam_id = r.steam_id and m.owner_id = r.requested_by
      left join steam_collection_state s on s.steam_id = r.steam_id
      where r.stopped_at is null and (s.last_success_at is null or s.last_success_at <= $1)
      order by s.last_success_at nulls first, r.requested_at, r.steam_id limit $2`,
    [dueBefore, maxAccounts + 1])).rows;
    const result = { eligible: eligible.length, collected: 0, unavailable: 0, failed: 0, changes: 0, deferred: 0 };
    const selected = eligible.slice(0, maxAccounts);
    result.deferred = eligible.length - selected.length;
    for (const [index, { steam_id: steamId }] of selected.entries()) {
      if (Date.now() - started + 12_000 >= budgetMs) {
        result.deferred += selected.length - index;
        break;
      }
      try {
        const library = await fetchLibrary(steamId);
        if (!library.ok) {
          result.unavailable++;
          await saveAccountState(steamId, now, 'unavailable', null);
          continue;
        }
        result.changes += await recordSteamObservation(steamId, library.games, now);
        result.collected++;
        await saveAccountState(steamId, now, 'success', null);
      } catch (error) {
        result.failed++;
        await saveAccountState(steamId, now, 'error', errorCode(error));
        if (error instanceof SteamNotConfiguredError || (error instanceof SteamUpstreamError && error.status === 429)) {
          result.deferred += selected.length - index - 1;
          break;
        }
      }
    }
    const status = result.failed || result.unavailable || result.deferred ? 'partial' : 'success';
    await pool.query(`update ops_jobs set status = $1, finished_at = now(), result = $2::jsonb where id = $3`,
      [status, JSON.stringify(result), id]);
    return { id, status, ...result };
  } catch (error) {
    await pool.query(`update ops_jobs set status = 'failed', finished_at = now(), error_code = 'collection_failed' where id = $1`, [id])
      .catch(() => console.error('Steam collection job completion failed'));
    throw error;
  }
}

async function saveAccountState(steamId: string, at: Date, result: 'success' | 'unavailable' | 'error', code: string | null) {
  await pool.query(`insert into steam_collection_state
    (steam_id, last_attempt_at, last_success_at, last_result, last_error_code)
    values ($1, $2, $3, $4, $5)
    on conflict (steam_id) do update set
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = coalesce(excluded.last_success_at, steam_collection_state.last_success_at),
      last_result = excluded.last_result,
      last_error_code = excluded.last_error_code`,
  [steamId, at, result === 'success' ? at : null, result, code]);
}
