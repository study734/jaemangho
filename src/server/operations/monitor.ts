import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from '../db';
import { pool } from '../pool';
import { envProblems } from '../env';
import { chatConfigured } from './jobs';

export interface Finding { key: string; title: string; severity: 'warning' | 'critical' }
export interface MonitorInput {
  envProblems: number;
  chatEnabled: boolean;
  lastSuccess: string | null;
  latestJob: { status: string; startedAt: string } | null;
  riot: { status: number; count: number }[];
  steamErrors: number;
}

export function findings(input: MonitorInput, now = Date.now()): Finding[] {
  const result: Finding[] = [];
  if (input.envProblems) result.push({ key: 'configuration', title: '환경변수 설정을 확인하세요.', severity: 'warning' });
  if (input.chatEnabled) {
    if (!input.lastSuccess || now - new Date(input.lastSuccess).getTime() > 30 * 3_600_000)
      result.push({ key: 'chat.stale', title: '채팅 동기화 성공 기록이 없거나 30시간 이상 지났습니다.', severity: 'warning' });
    if (input.latestJob?.status === 'failed' || input.latestJob?.status === 'partial')
      result.push({ key: 'chat.failed', title: '최근 채팅 동기화가 실패하거나 일부만 완료되었습니다.', severity: 'warning' });
    if (input.latestJob?.status === 'running' && now - new Date(input.latestJob.startedAt).getTime() > 5 * 60_000)
      result.push({ key: 'chat.interrupted', title: '채팅 동기화 실행이 중단된 것으로 보입니다. 재실행하세요.', severity: 'warning' });
  }
  if (input.riot.some((r) => [401, 403].includes(r.status) && r.count > 0))
    result.push({ key: 'riot.key', title: '최근 15분간 Riot 인증 오류가 발생했습니다. 키를 확인하세요.', severity: 'critical' });
  if (input.riot.filter((r) => r.status === 429).reduce((n, r) => n + r.count, 0) >= 5)
    result.push({ key: 'riot.limit', title: '최근 15분간 Riot 호출 제한이 반복되었습니다.', severity: 'warning' });
  if (input.riot.filter((r) => r.status >= 500).reduce((n, r) => n + r.count, 0) >= 3)
    result.push({ key: 'riot.upstream', title: '최근 15분간 Riot 서버 오류가 반복되었습니다.', severity: 'warning' });
  if (input.steamErrors >= 3)
    result.push({ key: 'steam.upstream', title: '최근 15분간 Steam 요청 오류가 반복되었습니다.', severity: 'warning' });
  return result;
}

const digest = (s: string) => createHash('sha256').update(s).digest();
export function authorizeMonitor(authorization: string | null, secret = process.env.CRON_SECRET) {
  if (!secret) return 'unconfigured';
  return authorization && timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`)) ? 'ok' : 'unauthorized';
}

// 허용한 Discord webhook만 사용한다. 리다이렉트를 따르지 않고, 주소/응답 내용은 로그와 DB에 남기지 않는다.
export function validWebhook(value: string | undefined) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['discord.com', 'discordapp.com'].includes(u.hostname) && !u.port && !u.username && !u.password &&
      /^\/api\/webhooks\/\d{17,20}\/[\w-]+$/.test(u.pathname) && !u.search && !u.hash;
  } catch { return false; }
}

export async function sendNotification(content: string, webhook = process.env.OPS_ALERT_WEBHOOK_URL, fetchFn = fetch) {
  if (!webhook) return 'disabled' as const;
  if (!validWebhook(webhook)) return 'invalid_configuration' as const;
  try {
    const response = await fetchFn(webhook, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1800), allowed_mentions: { parse: [] } }),
    });
    return response.ok ? 'sent' as const : 'delivery_failed' as const;
  } catch { return 'delivery_failed' as const; }
}

export async function checkOperations() {
  const client = await pool.connect();
  // 동시에 점검해도 같은 장애 알림을 중복 발송하지 않는다. 트랜잭션이 아닌 연결 단위 락.
  try {
    const [lock] = (await client.query('select pg_try_advisory_lock($1) as acquired', [727276])).rows;
    if (!lock.acquired) return { skipped: true, active: 0 };
    const sql = await db();
    const [lastSuccess, latest, riot, steam] = await Promise.all([
      sql`select max(finished_at) as at from ops_jobs where job = 'chat' and status = 'success'`,
      sql`select status, started_at as "startedAt" from ops_jobs where job = 'chat' order by started_at desc limit 1`,
      sql`select status, count(*)::int as count from riot_errors where at > now() - interval '15 minutes' group by status`,
      sql`select count(*)::int as count from steam_errors where at > now() - interval '15 minutes'`,
    ]);
    const current = findings({
      envProblems: envProblems().length, chatEnabled: chatConfigured(),
      lastSuccess: lastSuccess[0]?.at ? new Date(lastSuccess[0].at as string).toISOString() : null,
      latestJob: latest[0] as MonitorInput['latestJob'], riot: riot as MonitorInput['riot'], steamErrors: steam[0].count as number,
    });
    for (const f of current) {
      await sql`insert into ops_alerts (key, title, severity, active) values (${f.key}, ${f.title}, ${f.severity}, true)
        on conflict (key) do update set active = true, title = excluded.title, severity = excluded.severity,
          first_seen = case when ops_alerts.active then ops_alerts.first_seen else now() end, last_seen = now(), resolved_at = null`;
    }
    await sql`update ops_alerts set active = false, resolved_at = now() where active and not (key = any(${current.map((f) => f.key)}::text[]))`;
    // 전송 실패는 15분 뒤 재시도. 성공한 동일 상태는 보내지 않고, 장애→복구 전환만 보낸다.
    const pending = await sql`select key, title, active from ops_alerts
      where (notified_state is distinct from active) and (active or notified_state = true)
        and (notified_at is null or notified_at < now() - interval '15 minutes')`;
    for (const p of pending) {
      const delivery = await sendNotification(`[재망호 ${p.active ? '운영 알림' : '복구'}] ${p.title}`);
      if (delivery === 'disabled') continue;
      await sql`update ops_alerts set notified_at = now(), notified_state = case when ${delivery === 'sent'} then ${p.active}::boolean else notified_state end,
        notification_error = ${delivery === 'sent' ? null : delivery} where key = ${p.key}`;
    }
    await sql`insert into ops_monitor (id, checked_at) values (1, now()) on conflict (id) do update set checked_at = now()`;
    // 보존 기간을 명시하고 저빈도 통계는 1년간 유지한다.
    await sql`delete from steam_cache where expires_at < now()`;
    await sql`delete from steam_errors where at < now() - interval '7 days'`;
    await sql`delete from ops_jobs where status <> 'running' and started_at < now() - interval '90 days'`;
    await sql`delete from ops_audit where created_at < now() - interval '180 days'`;
    await sql`delete from page_views where day < (now() at time zone 'Asia/Seoul')::date - 365`;
    await sql`delete from steam_stats where day < (now() at time zone 'Asia/Seoul')::date - 365`;
    await sql`delete from riot_stats where day < (now() at time zone 'Asia/Seoul')::date - 365`;
    return { skipped: false, active: current.length };
  } finally {
    await client.query('select pg_advisory_unlock($1)', [727276]).catch(() => {});
    client.release();
  }
}
