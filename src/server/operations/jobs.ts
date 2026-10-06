import { randomUUID } from 'node:crypto';
import { pool } from '../pool';
import { db } from '../db';
import { syncChat, type SyncOptions } from '../chat/sync';

export class SyncBusyError extends Error {}
export class SyncUnconfiguredError extends Error {}

export function chatConfigured() {
  return !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

export async function runChatSync(source: 'scheduled' | 'manual', options?: SyncOptions) {
  if (!options && !chatConfigured()) throw new SyncUnconfiguredError();
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [727275]);
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
    await sql`update ops_jobs set status = ${partial ? 'partial' : 'success'}, finished_at = now(), result = ${JSON.stringify(result)}::jsonb where id = ${id}`;
    return { id, status: partial ? 'partial' as const : 'success' as const, ...result };
  } catch (error) {
    await sql`update ops_jobs set status = 'failed', finished_at = now(), error_code = 'sync_failed' where id = ${id}`
      .catch(() => console.error('sync job completion failed'));
    throw error;
  }
}
