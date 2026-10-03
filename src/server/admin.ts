import { z } from 'zod';
import { db } from './db';
import { envProblems } from './env';

// 관리자 대시보드가 쓰는 조회/조작. SQL은 여기에만 있고, 라우트는 인증과 검증만 한다.

export const blockInputSchema = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  blocked: z.boolean(),
});

export async function getStatus() {
  const sql = await db();
  const [cache, database, counts, errorsByStatus, recentErrors, stats] = await Promise.all([
    sql`select count(*)::int as rows,
               (count(*) filter (where expires_at > now()))::int as fresh,
               pg_total_relation_size('riot_cache')::float8 as bytes
        from riot_cache`,
    sql`select pg_database_size(current_database())::float8 as bytes`,
    sql`select (select count(*) from members)::int as members,
               (select count(*) from "user")::int as users,
               (select count(*) from "user" where banned)::int as blocked,
               (select count(*) from "user" where role = 'admin')::int as admins`,
    sql`select status, count(*)::int as count from riot_errors
        where at > now() - interval '24 hours' group by status order by status`,
    sql`select at, status, path from riot_errors order by at desc limit 10`,
    sql`select to_char(day, 'MM-DD') as day, hits, misses from riot_stats order by riot_stats.day desc limit 7`,
  ]);
  return {
    cache: cache[0],
    database: database[0],
    counts: counts[0],
    errorsByStatus,
    recentErrors,
    stats,
    // 설정이 잘못된 환경변수 이름과 이유 (값은 포함하지 않는다)
    envProblems: envProblems(),
  };
}

export async function listUsers() {
  const sql = await db();
  return sql`select id, name, username, (role = 'admin') as "isAdmin", coalesce(banned, false) as blocked,
    coalesce("loginCount", 0) as "loginCount", "createdAt" as "firstLogin", coalesce("lastLoginAt", "createdAt") as "lastLogin"
    from "user" order by coalesce("lastLoginAt", "createdAt") desc`;
}

// 등록 소환사와 등록자. 등록자는 새 사용자 id 또는 예전 방식(디스코드 ID)으로 저장된 값 모두 이름으로 해석한다.
export async function listSummonersWithCreators() {
  const sql = await db();
  return sql`select m.id, m.game_name as "gameName", m.tag_line as "tagLine",
    m.created_at as "createdAt", m.created_by as "createdBy",
    coalesce(u.name, du.name, m.created_by_name) as "createdByName"
    from members m
    left join "user" u on u.id = m.created_by
    left join account a on a."accountId" = m.created_by and a."providerId" = 'discord'
    left join "user" du on du.id = a."userId"
    order by m.created_at desc`;
}

// 사용자 차단/해제. 관리자는 차단할 수 없다. 대상이 없거나 관리자면 false.
// 차단하면 그 사용자의 세션을 모두 지워 바로 로그아웃시킨다 (admin 플러그인의 banUser와 같은 동작).
// 개발 로그인 우회에서도 동작하도록 플러그인 API 대신 직접 갱신한다.
export async function setBlocked(id: string, blocked: boolean): Promise<boolean> {
  const sql = await db();
  const rows = await sql`update "user" set banned = ${blocked}, "banReason" = ${blocked ? 'admin dashboard' : null}, "banExpires" = null
    where id = ${id} and coalesce(role, 'user') <> 'admin' returning id`;
  if (rows.length === 0) return false;
  if (blocked) await sql`delete from session where "userId" = ${id}`;
  return true;
}

// Riot 캐시 전체 삭제. 지운 행 수를 돌려준다.
export async function purgeRiotCache(): Promise<number> {
  const sql = await db();
  const rows = await sql`with d as (delete from riot_cache returning 1) select count(*)::int as deleted from d`;
  return rows[0].deleted as number;
}
