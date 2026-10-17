import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../pool';
import { AiError } from './client';
import { withAiClient } from './database';
import { reportFailure } from '../diagnostics';

export async function readPreference(userId: string, signal?: AbortSignal): Promise<string> {
  const result = await withAiClient(signal, client => client.query('select note from ai_preferences where user_id = $1', [userId]));
  return result.rows[0]?.note ?? '';
}

export async function savePreference(userId: string, note: string) {
  if (!note) { await pool.query('delete from ai_preferences where user_id = $1', [userId]); return; }
  const result = await pool.query(`insert into ai_preferences(user_id, note) select id, $2 from "user" where id = $1
    on conflict(user_id) do update set note = excluded.note, updated_at = now() returning user_id`, [userId, note]);
  if (!result.rowCount) throw new AiError('not_configured', 400, '실제 로그인 계정에서 취향을 저장해 주세요.');
}

async function locked<T>(work: (client: PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
  return withAiClient(signal, async client => {
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(727276)');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      if (!signal?.aborted) await client.query('rollback').catch(failure => reportFailure('ai.rollback', failure));
      throw error;
    }
  });
}

const busy = () => new AiError('busy', 429, '재순이가 잠깐 쉬고 있어요. 1분 뒤 다시 말 걸어 주세요.');

// Atomic across web instances. Network work never holds a DB connection or lock.
export async function acquireRequest(userId: string, signal?: AbortSignal): Promise<string> {
  return locked(async client => {
    await client.query(`delete from ai_requests where started_at < now() - interval '1 minute' and (active_until is null or active_until <= now())`);
    await client.query(`delete from ai_model_calls where called_at < now() - interval '24 hours'`);
    const { rows: [counts] } = await client.query(`select
      count(*) filter(where active_until > now())::int as active,
      count(*) filter(where user_id = $1 and active_until > now())::int as own_active,
      count(*) filter(where user_id = $1 and started_at > now() - interval '1 minute')::int as own_recent,
      exists(select 1 from ai_provider_pause where until_at > now()) as paused from ai_requests`, [userId]);
    if (counts.paused || counts.active >= 2 || counts.own_active || counts.own_recent >= 3) throw busy();
    const id = randomUUID();
    await client.query(`insert into ai_requests(id, user_id, active_until) values ($1, $2, now() + interval '30 seconds')`, [id, userId]);
    return id;
  }, signal);
}

export async function chargeModelCall(requestId: string, signal?: AbortSignal) {
  await locked(async client => {
    const { rows: [counts] } = await client.query(`select
      count(*) filter(where called_at > now() - interval '1 minute')::int as recent,
      count(*) filter(where called_at > now() - interval '24 hours')::int as daily,
      count(*) filter(where request_id = $1)::int as own,
      exists(select 1 from ai_provider_pause where until_at > now()) as paused,
      exists(select 1 from ai_requests where id = $1 and active_until > now()) as valid from ai_model_calls`, [requestId]);
    if (counts.daily >= 300) throw new AiError('busy', 429, '재망호의 최근 24시간 AI 사용 예산을 다 썼어요. 사용량이 해제된 뒤 다시 이용해 주세요.');
    if (counts.paused || !counts.valid || counts.own >= 2 || counts.recent >= 10) throw busy();
    await client.query('insert into ai_model_calls(request_id) values ($1)', [requestId]);
  }, signal);
}

export async function releaseRequest(requestId: string, signal?: AbortSignal) {
  await withAiClient(signal, client => client.query('update ai_requests set active_until = null where id = $1', [requestId]));
}

export async function pauseProvider(signal?: AbortSignal) {
  await withAiClient(signal, client => client.query(`insert into ai_provider_pause(id, until_at) values (1, now() + interval '1 minute')
    on conflict(id) do update set until_at = greatest(ai_provider_pause.until_at, excluded.until_at)`));
}
