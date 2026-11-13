import { db } from './db';
import { rankImprovements, type ImprovementReport } from '../lib/improvements';

// 관리자 "개선 우선순위"의 입력을 모은다. 판단 규칙은 src/lib/improvements.ts에 있다.
// 기간은 한국 시간 기준 오늘 포함 최근 7일(열람은 그 전 7일과 비교). Riot·Steam 오류 원본은 7일만 보관한다.
export async function improvementReport(): Promise<ImprovementReport> {
  const sql = await db();
  const [views, failures, riotErrors, steamErrors, chatJobs, alerts] = await Promise.all([
    sql`with t as (select (now() at time zone 'Asia/Seoul')::date as today)
      select path, coalesce(sum(views) filter (where day > t.today - 7), 0)::int as current,
        coalesce(sum(views) filter (where day <= t.today - 7), 0)::int as previous
      from page_views, t where day > t.today - 14 group by path`,
    sql`select operation, code, sum(count)::int as count from app_failures
      where day > (now() at time zone 'Asia/Seoul')::date - 7 group by operation, code`,
    sql`select status, count(*)::int as count from riot_errors where at > now() - interval '7 days' group by status`,
    sql`select code, count(*)::int as count from steam_errors where at > now() - interval '7 days' and code <> 'app_unavailable' group by code`,
    sql`select (count(*) filter (where status = 'failed'))::int as failed, (count(*) filter (where status = 'partial'))::int as partial
      from ops_jobs where job = 'chat' and started_at > now() - interval '7 days'`,
    sql`select key, title, severity from ops_alerts where active`,
  ]);
  return rankImprovements({
    views: views as never, failures: failures as never, riotErrors: riotErrors as never, steamErrors: steamErrors as never,
    chatJobs: (chatJobs[0] ?? { failed: 0, partial: 0 }) as never, alerts: alerts as never,
  });
}
