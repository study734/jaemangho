import { db } from '../db';
import { sendNotification } from './monitor';
import { usageStatus } from './usage';
import { NEON_BUDGET, type UsageBudget } from '../../lib/usage-budget';

// 주간 운영 요약: 지난주(한국 시간 월~일)의 무료 인프라 사용량과 개입이 필요했던 일만 운영 알림 채널로 한 번 보낸다.
// 매일 도는 Vercel 보조 점검(/api/cron/ops-watchdog)이 부르며, 아직 처리하지 않은 지난주가 있을 때만 동작한다(월요일 실행이
// 빠지면 다음 날 보낸다). 볼 것이 없는 주는 보내지 않는다(quiet). 계산은 summarizeWeek 순수 함수라 DB 없이 재현한다.

export interface Week { start: string; end: string } // 한국 시간 날짜, start 월요일 포함 ~ end 다음 월요일 미포함
export interface AlertRow { key: string; title: string; severity: 'warning' | 'critical' }
export interface WeekInput {
  week: Week;
  usage: UsageBudget;
  alerts: { opened: AlertRow[]; resolved: AlertRow[]; active: AlertRow[] };
  failures: { operation: string; code: string; count: number }[]; // app_failures 지난주 합계
  chat: { failed: number; partial: number };
  interventions: { total: number; failed: number }; // ops_audit(관리자 수동 작업)
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function lastCompletedWeek(now = Date.now()): Week {
  const kst = new Date(now + KST);
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const thisMonday = today - ((kst.getUTCDay() + 6) % 7) * DAY;
  return { start: isoDate(thisMonday - 7 * DAY), end: isoDate(thisMonday) };
}

// 집계 기간(보통 한 달) 중 지난 비율로 월말 사용량을 단순 비례 추정한다. 하루 미만 경과면 추정하지 않는다.
export function projectUsage(usage: UsageBudget) {
  const s = usage.sample;
  if (!s) return null;
  const start = Date.parse(s.periodStart), at = Date.parse(s.at);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const elapsed = at - start, length = end.getTime() - start;
  const scale = elapsed >= DAY ? length / elapsed : null;
  const ratio = (value: number, budget: number) => value / budget;
  return {
    compute: ratio(s.computeSeconds, NEON_BUDGET.computeSeconds), transfer: ratio(s.transferBytes, NEON_BUDGET.transferBytes),
    projectedCompute: scale && ratio(s.computeSeconds * scale, NEON_BUDGET.computeSeconds),
    projectedTransfer: scale && ratio(s.transferBytes * scale, NEON_BUDGET.transferBytes),
  };
}

const MODE = { normal: '정상', limited: '감속', paused: '중단', unconfigured: '미설정' } as const;
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const RETRY = 'db.connect-retry';
const WATCH = 0.7; // 현재·월말 추정 사용률이 이 이상이면 요약에 넣는다(감속 80%보다 먼저 알린다)

function usageLines(usage: UsageBudget): string[] {
  const mode = `예약 수집 ${MODE[usage.mode]}`;
  if (usage.errorCode || usage.stale || !usage.sample) {
    const reason = usage.errorCode === 'unconfigured' || usage.mode === 'unconfigured' ? 'NEON_API_KEY 미등록'
      : usage.errorCode ? `조회 실패(${usage.errorCode})` : '최근 24시간 샘플 없음';
    return [`- Neon 사용량 확인 불가: ${reason} · ${mode}. 조치: Free usage protection 워크플로와 GitHub Secrets 확인`];
  }
  const p = projectUsage(usage)!;
  const peak = Math.max(p.compute, p.transfer, p.projectedCompute ?? 0, p.projectedTransfer ?? 0);
  if (usage.mode === 'normal' && peak < WATCH) return [];
  const projected = p.projectedCompute === null ? '' : ` (이 속도면 월말 연산 ${pct(p.projectedCompute)}·전송 ${pct(p.projectedTransfer!)})`;
  return [`- Neon 연산 ${pct(p.compute)}·전송 ${pct(p.transfer)}${projected} · ${mode}. 80%에서 감속, 90%에서 예약 수집 중단`];
}

export function summarizeWeek(input: WeekInput): string | null {
  const lines: string[] = [];
  const free = usageLines(input.usage);
  const retries = input.failures.filter((f) => f.operation === RETRY).reduce((n, f) => n + f.count, 0);
  if (retries) free.push(`- DB 새 연결 시간 초과 후 다시 시도로 회복 ${retries}회(사용자 대기 10초 이상, Neon 절전·인스턴스 정지 추정)`);
  if (free.length) lines.push('무료 인프라', ...free);

  const { opened, resolved, active } = input.alerts;
  const titles = (rows: AlertRow[]) => rows.slice(0, 5).map((a) => `${a.severity === 'critical' ? '긴급 ' : ''}${a.title}`).join(' / ');
  const alertLines = [
    opened.length ? `- 새 경고 ${opened.length}건: ${titles(opened)}` : '',
    resolved.length ? `- 해소 ${resolved.length}건` : '',
    active.length ? `- 아직 진행 중 ${active.length}건: ${titles(active)}` : '',
  ].filter(Boolean);
  if (alertLines.length) lines.push('장애·경고', ...alertLines);

  const failures = input.failures.filter((f) => f.operation !== RETRY).sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));
  const failureTotal = failures.reduce((n, f) => n + f.count, 0);
  const work = [
    failureTotal ? `- 서버 실패 ${failureTotal}회: ${failures.slice(0, 3).map((f) => `${f.operation}(${f.code}) ${f.count}`).join(', ')}` : '',
    input.chat.failed || input.chat.partial ? `- 채팅 동기화 실패 ${input.chat.failed}회·부분 완료 ${input.chat.partial}회` : '',
    input.interventions.total ? `- 관리자 수동 작업 ${input.interventions.total}회${input.interventions.failed ? `(실패 ${input.interventions.failed})` : ''}` : '',
  ].filter(Boolean);
  if (work.length) lines.push('실패·개입', ...work);

  if (!lines.length) return null;
  const label = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const last = isoDate(Date.parse(input.week.end) - DAY);
  return [`[재망호 주간 요약] ${label(input.week.start)}–${label(last)}`, ...lines, '자세한 내용: 관리자 화면 운영 상태·개선 우선순위'].join('\n');
}

export async function collectWeek(week: Week): Promise<WeekInput> {
  const sql = await db();
  const from = `${week.start}T00:00:00+09:00`, to = `${week.end}T00:00:00+09:00`;
  const [opened, resolved, active, failures, chat, audit, usage] = await Promise.all([
    sql`select key, title, severity from ops_alerts where first_seen >= ${from}::timestamptz and first_seen < ${to}::timestamptz order by first_seen`,
    sql`select key, title, severity from ops_alerts where resolved_at >= ${from}::timestamptz and resolved_at < ${to}::timestamptz order by resolved_at`,
    sql`select key, title, severity from ops_alerts where active order by first_seen`,
    sql`select operation, code, sum(count)::int as count from app_failures where day >= ${week.start}::date and day < ${week.end}::date group by operation, code`,
    sql`select (count(*) filter (where status = 'failed'))::int as failed, (count(*) filter (where status = 'partial'))::int as partial
      from ops_jobs where job = 'chat' and started_at >= ${from}::timestamptz and started_at < ${to}::timestamptz`,
    sql`select count(*)::int as total, (count(*) filter (where result = 'failed'))::int as failed
      from ops_audit where created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz`,
    usageStatus(),
  ]);
  return {
    week, usage, alerts: { opened: opened as never, resolved: resolved as never, active: active as never },
    failures: failures as never, chat: chat[0] as never, interventions: audit[0] as never,
  };
}

export type WeeklySummaryResult = 'already_handled' | 'quiet' | Awaited<ReturnType<typeof sendNotification>>;

// 지난주를 먼저 선점(insert)해 동시·중복 실행에서 한 번만 보낸다. 전송 실패나 수집 오류면 선점을 지워 다음 날 다시 시도한다.
export async function sendWeeklySummary(now = Date.now(), send: (content: string) => ReturnType<typeof sendNotification> = (c) => sendNotification(c)): Promise<WeeklySummaryResult> {
  const week = lastCompletedWeek(now);
  const sql = await db();
  // 선점 뒤 함수가 끝나지 못해 pending으로 1시간 넘게 남은 주는 다시 선점한다.
  const claimed = await sql`insert into ops_weekly_summaries (week) values (${week.start}::date)
    on conflict (week) do update set status = 'pending', updated_at = now()
      where ops_weekly_summaries.status = 'pending' and ops_weekly_summaries.updated_at < now() - interval '1 hour'
    returning week`;
  if (!claimed.length) return 'already_handled';
  let result: WeeklySummaryResult;
  try {
    const message = summarizeWeek(await collectWeek(week));
    result = message ? await send(message) : 'quiet';
  } catch (error) {
    await sql`delete from ops_weekly_summaries where week = ${week.start}::date`;
    throw error;
  }
  if (result === 'delivery_failed') await sql`delete from ops_weekly_summaries where week = ${week.start}::date`;
  else await sql`update ops_weekly_summaries set status = ${result}, updated_at = now() where week = ${week.start}::date`;
  return result;
}
