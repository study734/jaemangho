import { db } from './db';
import type { TrackKey } from '../lib/track';

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
