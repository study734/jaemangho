import { db } from './db';
import type { TrackKey } from '../lib/track';
import { z } from 'zod';
import type { ViewReport } from '../lib/operations';

export const viewReportSchema = z.object({
  days: z.enum(['7', '30', '90']).default('7').transform(Number),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const date = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s && s >= '2000-01-01' &&
      s <= new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  }, '올바른 날짜를 입력하세요').optional(),
});

// 화면 열람 횟수(한국 시간 날짜별). 누가 열었는지는 저장하지 않는다.
export async function recordView(key: TrackKey) {
  const sql = await db();
  await sql`insert into page_views (day, path, views) values ((now() at time zone 'Asia/Seoul')::date, ${key}, 1)
    on conflict (day, path) do update set views = page_views.views + 1`;
}

export interface ViewStat {
  path: string;
  today: number;
  week: number; // 오늘 포함 최근 7일
}

export async function viewStats(): Promise<ViewStat[]> {
  const sql = await db();
  const rows = await sql`with t as (select (now() at time zone 'Asia/Seoul')::date as today)
    select p.path, coalesce(sum(p.views) filter (where p.day = t.today), 0)::int as today, coalesce(sum(p.views), 0)::int as week
    from page_views p, t where p.day > t.today - 7 group by p.path order by week desc, p.path`;
  return rows.map((r) => ({ path: r.path as string, today: r.today as number, week: r.week as number }));
}

export async function viewReport(days: number, end?: string): Promise<ViewReport> {
  const sql = await db();
  const [period] = await sql`with t as (select coalesce(${end ?? null}::date, (now() at time zone 'Asia/Seoul')::date) as last)
    select (last - ${days - 1}::int)::text as start, last::text as end,
      (last - ${days * 2 - 1}::int)::text as "previousStart", (last - ${days}::int)::text as "previousEnd" from t`;
  const [summary, daily] = await Promise.all([
    sql`select path, coalesce(sum(views) filter (where day >= ${period.start}::date), 0)::int as current,
      coalesce(sum(views) filter (where day < ${period.start}::date), 0)::int as previous
      from page_views where day between ${period.previousStart}::date and ${period.end}::date
      group by path order by current desc, path`,
    sql`select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(p.views), 0)::int as views
      from generate_series(${period.start}::date, ${period.end}::date, interval '1 day') d
      left join page_views p on p.day = d::date group by d order by d`,
  ]);
  return { days, ...period, summary, daily } as unknown as ViewReport;
}
