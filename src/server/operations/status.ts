import { db } from '../db';
import { chatConfigured } from './jobs';
import { validWebhook } from './monitor';
import type { OperationsData } from '../../lib/operations';

export async function operationStatus(): Promise<OperationsData> {
  const sql = await db();
  const [jobs, success, alerts, checked, audit, cache, stats, errors] = await Promise.all([
    sql`select id, status, source, started_at as "startedAt", finished_at as "finishedAt", result, error_code as "errorCode"
      from ops_jobs where job = 'chat' order by started_at desc limit 20`,
    sql`select max(finished_at) as at from ops_jobs where job = 'chat' and status = 'success'`,
    sql`select key, title, severity, active, first_seen as "firstSeen", resolved_at as "resolvedAt", notification_error as "notificationError"
      from ops_alerts order by active desc, last_seen desc limit 30`,
    sql`select checked_at as at from ops_monitor where id = 1`,
    sql`select id::text, actor_name as "actorName", action, target, result, created_at as "createdAt" from ops_audit order by id desc limit 100`,
    sql`select count(*)::int as rows, (count(*) filter (where expires_at > now()))::int as fresh from steam_cache`,
    sql`select day::text, hits, misses, errors from steam_stats order by day desc limit 7`,
    sql`select at, endpoint, code from steam_errors order by at desc limit 10`,
  ]);
  return {
    jobs, lastSuccess: success[0]?.at ?? null, alerts, checkedAt: checked[0]?.at ?? null, audit,
    chatConfigured: chatConfigured(), notificationsConfigured: validWebhook(process.env.OPS_ALERT_WEBHOOK_URL),
    steam: { cache: cache[0], stats, errors },
  } as unknown as OperationsData;
}

// 현황 내보내기에는 로그인 토큰, 계정 연결의 비밀값, API 키, 메시지 내용을 담지 않는다.
export async function operationSnapshot() {
  return { version: 1, generatedAt: new Date().toISOString(), operations: await operationStatus() };
}
