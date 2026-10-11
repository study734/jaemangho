import { randomUUID } from 'node:crypto';
import { pool } from '../pool';
import { db } from '../db';
import { syncChat, type SyncOptions } from '../chat/sync';
import { DiscordRateLimitedError, DiscordRequestError } from '../chat/bot';
import { z } from 'zod';

export class SyncBusyError extends Error {}
export class SyncUnconfiguredError extends Error {}

export function chatConfigured() {
  return !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

export function syncErrorCode(error: unknown) {
  if (error instanceof DiscordRequestError) return /^discord_http_[1-5]\d\d$/.test(error.code) || ['discord_timeout', 'discord_network', 'discord_invalid_response'].includes(error.code) ? error.code : 'sync_failed';
  if (error instanceof DiscordRateLimitedError) return error.reason;
  if (error instanceof z.ZodError) return 'discord_invalid_response';
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    if (['42P01', '42703'].includes(error.code)) return 'database_schema';
    if (error.code === '57014') return 'database_timeout';
    if (/^08[A-Z0-9]{3}$/.test(error.code) || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) return 'database_connection';
    if (/^[0-9A-Z]{5}$/.test(error.code)) return 'database_error';
  }
  return 'sync_failed';
}

export function canResumeChat(job: { id: string; status: string; finishedAt: string | null; result: { rateLimited?: boolean; truncated?: boolean; retryAfterMs?: number; warnings?: string[] } | null } | undefined, now = Date.now()) {
  if (!job || job.status !== 'partial' || !job.finishedAt || job.result?.warnings?.length || !(job.result?.rateLimited || job.result?.truncated)) return false;
  const elapsed = now - Date.parse(job.finishedAt);
  return elapsed >= Math.max(15 * 60_000, job.result.retryAfterMs ?? 0) && elapsed < 48 * 3_600_000;
}

export async function runChatSync(source: 'scheduled' | 'manual', options?: SyncOptions, resumeJobId?: string) {
  if (!options && !chatConfigured()) throw new SyncUnconfiguredError();
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [727275]);
    if (resumeJobId) {
      const latest = (await client.query(`select id, status, finished_at as "finishedAt", result from ops_jobs where job = 'chat' order by started_at desc limit 1`)).rows[0];
      if (latest?.id !== resumeJobId || !canResumeChat(latest)) throw new SyncBusyError();
    }
    // 함수가 강제 종료되면 finally도 실행되지 않는다. 오래된 실행은 다음 요청에서 복구한다.
    await client.query(`update ops_jobs set status = 'failed', error_code = 'interrupted', finished_at = now()
      where job = 'chat' and status = 'running' and started_at < now() - interval '5 minutes'`);
    const inserted = await client.query(`insert into ops_jobs (id, job, source, status) values ($1, 'chat', $2, 'running')
      on conflict (job) where status = 'running' do nothing returning id`, [id, source]);
    await client.query('commit');
    if (!inserted.rowCount) throw new SyncBusyError();
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const sql = await db();
  try {
    const result = await syncChat(options ?? {
      token: process.env.DISCORD_BOT_TOKEN!, guildId: process.env.DISCORD_GUILD_ID!, laugh: process.env.CHAT_LAUGH === '1',
    });
    const partial = result.rateLimited || result.truncated || !!result.warnings?.length || result.channels === 0;
    const recorded = { ...result, ...(resumeJobId ? { resumedFrom: resumeJobId } : {}) };
    await sql`update ops_jobs set status = ${partial ? 'partial' : 'success'}, finished_at = now(), result = ${JSON.stringify(recorded)}::jsonb where id = ${id}`;
    return { id, status: partial ? 'partial' as const : 'success' as const, ...result };
  } catch (error) {
    await sql`update ops_jobs set status = 'failed', finished_at = now(), error_code = ${syncErrorCode(error)} where id = ${id}`
      .catch(() => console.error('sync job completion failed'));
    throw error;
  }
}

// 기존 외부 점검 한 번당 한 배치만 이어 받는다. 권한 오류나 집계 실패는 자동 반복하지 않는다.
export async function resumePendingChat() {
  if (!chatConfigured()) return 'not_needed';
  const sql = await db();
  const [latest] = await sql`select id, status, finished_at as "finishedAt", result from ops_jobs where job = 'chat' order by started_at desc limit 1`;
  if (!canResumeChat(latest as Parameters<typeof canResumeChat>[0])) return 'not_needed';
  try {
    const result = await runChatSync('scheduled', { token: process.env.DISCORD_BOT_TOKEN!, guildId: process.env.DISCORD_GUILD_ID!,
      laugh: process.env.CHAT_LAUGH === '1', budgetMs: 25_000 }, latest.id as string);
    return result.status;
  } catch (error) {
    if (error instanceof SyncBusyError) return 'busy';
    // 실행의 안전한 오류 코드는 ops_jobs에 남긴다. 외부 점검은 계속한다.
    return 'failed';
  }
}
