import { reportFailure } from '../diagnostics';
import { randomUUID } from 'node:crypto';
import { pool } from '../pool';
import { getLibrary, SteamNotConfiguredError, SteamPayloadError, SteamUpstreamError, type Library } from '../steam/client';
import { recordSteamObservation } from './steam-facts';
import { STEAM_NOTICE_VERSION } from './steam-policy';
import { STEAM_FEATURE_NOTICE } from '../steam/consent';
import { usageStatus } from '../operations/usage';
import { scheduledCollectionAllowed } from '../../lib/usage-budget';

const WEEK_MS = 7 * 86_400_000;
const JOB = 'steam_activity';
const MAX_ACCOUNTS = 20;

export class SteamCollectionBusyError extends Error {}
// 예약 수집이 무료 사용량 보호(중단, 또는 감속 중 이틀 이내)로 막혔다. 실행 기록은 남기지 않는다.
export class SteamCollectionBudgetError extends Error {}

export interface SteamCollectionOptions {
  now?: Date;
  maxAccounts?: number;
  budgetMs?: number;
  fetchLibrary?: (steamId: string) => Promise<Library>;
  steamIds?: string[];
}

function errorCode(error: unknown): string {
  if (error instanceof SteamNotConfiguredError) return 'not_configured';
  if (error instanceof SteamPayloadError) return 'invalid_response';
  if (error instanceof SteamUpstreamError) return `upstream_${error.status}`;
  return 'collection_failed';
}

// 'manual': 동의·수집 요청 직후와 활동 설정 조회 때, 그 사람의 확인된 계정만 넘긴다(사용량과 무관).
// 'scheduled': 매일 운영 보조 점검(/api/cron/ops-watchdog) 뒤에 대상 전체를 이어서 수집한다. 새 Cron 없이
// 이미 DB를 깨운 요청 안에서 돌고, 채팅 예약 수집과 같은 무료 사용량 보호를 따른다(intent/0001-steam-regular-collection).
export async function runSteamCollection(source: 'scheduled' | 'manual', options: SteamCollectionOptions = {}) {
  const { now = new Date(), maxAccounts = MAX_ACCOUNTS, budgetMs = 45_000, fetchLibrary = getLibrary } = options;
  if (!Number.isInteger(maxAccounts) || maxAccounts < 1 || maxAccounts > MAX_ACCOUNTS) throw new Error('Invalid account limit');
  const started = Date.now();
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [727276]);
    if (source === 'scheduled') {
      const budget = await usageStatus();
      const last = budget.mode === 'limited' ? (await client.query(`select max(started_at) as at from ops_jobs
        where job = $1 and source = 'scheduled'`, [JOB])).rows[0]?.at : null;
      if (!scheduledCollectionAllowed(budget, last ? new Date(last).toISOString() : null)) throw new SteamCollectionBudgetError();
    }
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
      join steam_verified_accounts v on v.steam_id = r.steam_id and v.user_id = r.requested_by
      join "user" u on u.id = r.requested_by and not coalesce(u.banned, false)
      join steam_feature_consents f on f.user_id=r.requested_by and f.notice_version=$6 and f.revoked_at is null
      left join steam_collection_state s on s.steam_id = r.steam_id
      where r.stopped_at is null and (s.last_success_at is null or s.last_success_at <= $1)
        and ($3::text[] is null or r.steam_id=any($3::text[]))
        and (s.last_attempt_at is null or s.last_attempt_at <= $4)
        and r.notice_version=$5
      order by s.last_success_at nulls first, r.requested_at, r.steam_id limit $2`,
    [dueBefore, maxAccounts + 1, options.steamIds ?? null, new Date(now.getTime() - 15 * 60_000), STEAM_NOTICE_VERSION, STEAM_FEATURE_NOTICE])).rows;
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
      .catch(error => reportFailure('steam.collection.fail-record', error));
    throw error;
  }
}

async function saveAccountState(steamId: string, at: Date, result: 'success' | 'unavailable' | 'error', code: string | null) {
  await pool.query(`insert into steam_collection_state
    (steam_id, last_attempt_at, last_success_at, last_result, last_error_code)
    select r.steam_id, $2::timestamptz, $3::timestamptz, $4, $5
    from steam_collection_requests r
    join steam_members m on m.steam_id = r.steam_id and m.owner_id = r.requested_by
    join steam_verified_accounts v on v.steam_id = r.steam_id and v.user_id = r.requested_by
    where r.steam_id = $1 and r.stopped_at is null
    for share of r
    on conflict (steam_id) do update set
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = coalesce(excluded.last_success_at, steam_collection_state.last_success_at),
      last_result = excluded.last_result,
      last_error_code = excluded.last_error_code`,
  [steamId, at, result === 'success' ? at : null, result, code]);
}

// 운영 보조 점검(/api/cron/ops-watchdog)이 부르는 Steam 예약 수집(intent/0001). 점검이 DB를 쓴 뒤에만 돌아 Neon을 새로 깨우지 않는다.
// 점검·요약과 합쳐 maxDuration 60초 안에 끝나도록 25초 예산이며, 남은 계정은 다음 날 이어서 한다.
// 거부·실패는 점검 응답을 바꾸지 않도록 상태 문자열로 돌려주고, 응답에는 상태와 개수만 담는다.
export async function runScheduledSteamCollection(run: typeof runSteamCollection = runSteamCollection) {
  try {
    const result = await run('scheduled', { budgetMs: 25_000 });
    return { status: result.status, eligible: result.eligible, collected: result.collected, unavailable: result.unavailable,
      failed: result.failed, changes: result.changes, deferred: result.deferred };
  } catch (error) {
    if (error instanceof SteamCollectionBudgetError) return 'budget' as const;
    if (error instanceof SteamCollectionBusyError) return 'busy' as const;
    reportFailure('steam.activity.scheduled', error);
    return 'failed' as const;
  }
}
