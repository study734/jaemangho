import { randomUUID } from 'node:crypto';
import { pool } from '../pool';
import { db } from '../db';
import { syncChat, type SyncOptions } from '../chat/sync';
import { syncErrorCode } from './failures';
import { DiscordRateLimitedError } from '../chat/bot';
export { syncErrorCode } from './failures';
import { chatRecoveryPlan, type RecoveryJob } from '../../lib/chat-recovery';

export class SyncBusyError extends Error {}
export class SyncUnconfiguredError extends Error {}

export function chatConfigured() {
  return !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

export function canResumeChat(job: RecoveryJob | undefined, now = Date.now()) {
  return chatRecoveryPlan(job, now).state === 'ready';
}

export function safeFailure(error: unknown, stage: string) {
  const code = syncErrorCode(error);
  const sqlState = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined;
  const httpStatus = /^discord_http_(\d{3})$/.exec(code)?.[1];
  return { stage, code, ...(sqlState ? { sqlState } : {}), ...(httpStatus ? { httpStatus: Number(httpStatus) } : {}) };
}

export async function runChatSync(source: 'scheduled' | 'manual', options?: SyncOptions, resumeJobId?: string) {
  if (!options && !chatConfigured()) throw new SyncUnconfiguredError();
  const id = randomUUID();
  let metadata: Record<string, unknown> = { stage: 'starting' };
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [727275]);
    // 강제 종료도 다음 복구 요청에서 일시 오류로 분류한다.
    await client.query(`update ops_jobs set status = 'failed', error_code = 'interrupted', finished_at = started_at + interval '5 minutes'
      where job = 'chat' and status = 'running' and started_at < now() - interval '5 minutes'`);
    if (resumeJobId) {
      const latest = (await client.query(`select id, status, started_at as "startedAt", finished_at as "finishedAt", error_code as "errorCode", result from ops_jobs where job = 'chat' order by started_at desc limit 1`)).rows[0];
      if ((latest?.id ?? '__missing__') !== resumeJobId || !canResumeChat(latest)) throw new SyncBusyError();
      const catchup = !latest || latest.status === 'success';
      metadata = { ...metadata, ...(latest ? { resumedFrom: latest.id } : {}), recoveryAttempt: catchup ? 1 : (latest.result?.recoveryAttempt ?? 0) + 1,
        recoveryStartedAt: catchup ? new Date().toISOString() : latest.result?.recoveryStartedAt ?? latest.finishedAt };
    }
    const inserted = await client.query(`insert into ops_jobs (id, job, source, status, result) values ($1, 'chat', $2, 'running', $3::jsonb)
      on conflict (job) where status = 'running' do nothing returning id`, [id, source, JSON.stringify(metadata)]);
    await client.query('commit');
    if (!inserted.rowCount) throw new SyncBusyError();
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const sql = await db();
  let stage = 'starting';
  try {
    const result = await syncChat({ ...(options ?? {
      token: process.env.DISCORD_BOT_TOKEN!, guildId: process.env.DISCORD_GUILD_ID!, laugh: process.env.CHAT_LAUGH === '1',
    }), onStage: async next => {
      stage = next;
      await sql`update ops_jobs set result = result || ${JSON.stringify({ stage })}::jsonb where id = ${id}`;
      await options?.onStage?.(next);
    } });
    const partial = result.rateLimited || result.truncated || !!result.warnings?.length || result.channels === 0;
    const recorded = { ...metadata, ...result, stage: 'complete' };
    await sql`update ops_jobs set status = ${partial ? 'partial' : 'success'}, finished_at = now(), result = ${JSON.stringify(recorded)}::jsonb where id = ${id}`;
    return { id, status: partial ? 'partial' as const : 'success' as const, ...result };
  } catch (error) {
    const retryAfterMs = error instanceof DiscordRateLimitedError ? error.retryAfterMs : undefined;
    await sql`update ops_jobs set status = 'failed', finished_at = now(), error_code = ${syncErrorCode(error)}, result = result || ${JSON.stringify({ failure: safeFailure(error, stage), stage, ...(retryAfterMs ? { retryAfterMs } : {}) })}::jsonb where id = ${id}`
      .catch(() => console.error('sync job completion failed'));
    throw error;
  }
}

// 점검과 다른 요청에서 한 배치만 실행한다. 최신 실행의 ID를 락 안에서 다시 검사한다.
export async function resumePendingChat() {
  if (!chatConfigured()) return 'not_needed';
  const sql = await db();
  await sql`update ops_jobs set status = 'failed', error_code = 'interrupted', finished_at = started_at + interval '5 minutes'
    where job = 'chat' and status = 'running' and started_at < now() - interval '5 minutes'`;
  const [latest] = await sql`select id, status, started_at as "startedAt", finished_at as "finishedAt", error_code as "errorCode", result from ops_jobs where job = 'chat' order by started_at desc limit 1`;
  const plan = chatRecoveryPlan(latest as unknown as RecoveryJob | undefined);
  if (plan.state !== 'ready') return plan.state;
  try {
    const result = await runChatSync('scheduled', { token: process.env.DISCORD_BOT_TOKEN!, guildId: process.env.DISCORD_GUILD_ID!,
      laugh: process.env.CHAT_LAUGH === '1', budgetMs: 25_000, resumeOnly: true }, (latest?.id as string) ?? '__missing__');
    return result.status;
  } catch (error) {
    if (error instanceof SyncBusyError) return 'busy';
    return 'failed';
  }
}

// 복구 실행기 자체의 성공 시각도 남긴다. 점검 성공이 복구 실행 누락을 가리지 않는다.
export async function runChatRecovery() {
  const sql = await db();
  const id = randomUUID();
  await sql`update ops_jobs set status = 'failed', error_code = 'interrupted', finished_at = now()
    where job = 'recovery' and status = 'running' and started_at < now() - interval '5 minutes'`;
  // 독립 Worker와 GitHub 보조 실행이 가까이 도착하면 완료된 결과를 중복 실행하지 않는다.
  // 새로운 채팅 실행·실패가 생겼거나 10분이 지나면 다시 확인한다. 성공 시각은 연장하지 않는다.
  const inserted = await sql`insert into ops_jobs (id, job, source, status)
    select ${id}, 'recovery', 'scheduled', 'running'
    where not exists (
      select 1 from ops_jobs recent where recent.job = 'recovery' and recent.status = 'success'
        and recent.finished_at > now() - interval '10 minutes'
        and recent.result->>'recovery' in ('success', 'waiting', 'not_needed')
        and not exists (select 1 from ops_jobs chat where chat.job = 'chat' and chat.started_at > recent.finished_at)
    )
    on conflict (job) where status = 'running' do nothing returning id`;
  if (!inserted.length) return 'busy';
  try {
    const recovery = await resumePendingChat();
    await sql`update ops_jobs set status = ${recovery === 'failed' ? 'failed' : 'success'}, finished_at = now(),
      result = ${JSON.stringify({ recovery })}::jsonb where id = ${id}`;
    return recovery;
  } catch (error) {
    await sql`update ops_jobs set status = 'failed', finished_at = now(), error_code = ${syncErrorCode(error)} where id = ${id}`.catch(() => {});
    throw error;
  }
}
