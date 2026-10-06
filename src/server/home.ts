import { db } from './db';

export type ActivityKind = 'lol' | 'steam' | 'login';
export interface Activity {
  kind: ActivityKind;
  actor: string;
  target: string;
  at: string; // ISO 시각
}
export interface Person {
  id: string;
  name: string;
  at: string;
  image: string | null;
}

// 홈 화면용: 새 테이블 없이 이미 있는 기록(소환사·Steam 등록, 마지막 접속)을 시간순으로 합친다.
// ponytail: 주제가 늘면 여기에 union 한 줄씩 더한다. 열 개를 넘기면 활동 기록 테이블을 따로 둔다.
export async function getHomeFeed(): Promise<{ activity: Activity[]; people: Person[] }> {
  const sql = await db();
  const [activity, people] = await Promise.all([
    sql`select kind, actor, target, at from (
          select 'lol' as kind, coalesce(created_by_name, '') as actor, game_name || '#' || tag_line as target, created_at as at from members
          union all
          select 'steam', coalesce(created_by_name, ''), persona_name, created_at from steam_members
          union all
          select 'login', name, '', "lastLoginAt" from "user" where "lastLoginAt" is not null and not coalesce(banned, false)
        ) t order by at desc limit 15`,
    sql`select id, name, image, coalesce("lastLoginAt", "createdAt") as at from "user"
        where not coalesce(banned, false) order by coalesce("lastLoginAt", "createdAt") desc limit 10`,
  ]);
  const iso = (v: unknown) => new Date(v as string | Date).toISOString();
  return {
    activity: activity.map((r) => ({ kind: r.kind as ActivityKind, actor: r.actor as string, target: r.target as string, at: iso(r.at) })),
    people: people.map((r) => ({ id: r.id as string, name: r.name as string, image: (r.image as string | null) ?? null, at: iso(r.at) })),
  };
}
