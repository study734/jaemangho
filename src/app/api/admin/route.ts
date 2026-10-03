import type { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { forget } from '@/server/users';
import { requireAdmin } from '@/server/viewer';

// 관리자 전용 API. 리소스별 파일을 따로 두지 않고 ?resource= 로 나눈다.
const serverError = (e: unknown) => {
  console.error(e);
  return Response.json({ error: 'Server error' }, { status: 500 });
};

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const resource = request.nextUrl.searchParams.get('resource');
  try {
    const sql = await db();

    if (resource === 'status') {
      const [cache, database, counts, errorsByStatus, recentErrors, stats] = await Promise.all([
        sql`select count(*)::int as rows,
                   (count(*) filter (where expires_at > now()))::int as fresh,
                   pg_total_relation_size('riot_cache')::float8 as bytes
            from riot_cache`,
        sql`select pg_database_size(current_database())::float8 as bytes`,
        sql`select (select count(*) from members)::int as members,
                   (select count(*) from users)::int as users,
                   (select count(*) from users where blocked)::int as blocked,
                   (select count(*) from users where is_admin)::int as admins`,
        sql`select status, count(*)::int as count from riot_errors
            where at > now() - interval '24 hours' group by status order by status`,
        sql`select at, status, path from riot_errors order by at desc limit 10`,
        sql`select to_char(day, 'MM-DD') as day, hits, misses from riot_stats order by riot_stats.day desc limit 7`,
      ]);
      return Response.json({
        cache: cache[0], database: database[0], counts: counts[0], errorsByStatus, recentErrors, stats,
      });
    }

    if (resource === 'users') {
      const rows = await sql`select id, name, username, is_admin as "isAdmin", blocked, login_count as "loginCount",
        first_login as "firstLogin", last_login as "lastLogin"
        from users order by last_login desc`;
      return Response.json(rows);
    }

    if (resource === 'members') {
      const rows = await sql`select m.id, m.game_name as "gameName", m.tag_line as "tagLine",
        m.created_at as "createdAt", m.created_by as "createdBy", coalesce(u.name, m.created_by_name) as "createdByName"
        from members m left join users u on u.id = m.created_by order by m.created_at desc`;
      return Response.json(rows);
    }

    return Response.json({ error: 'Unknown resource' }, { status: 404 });
  } catch (e) {
    return serverError(e);
  }
}

// 사용자 차단/해제
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (request.nextUrl.searchParams.get('resource') !== 'users') {
    return Response.json({ error: 'Unknown resource' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { id?: unknown; blocked?: unknown } | null;
  const { id, blocked } = body ?? {};
  if (typeof id !== 'string' || !/^\d{1,25}$/.test(id) || typeof blocked !== 'boolean') {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (id === admin.id) return Response.json({ error: '자기 자신은 차단할 수 없습니다.' }, { status: 400 });

  try {
    const sql = await db();
    // 관리자는 차단할 수 없다(is_admin = false 조건). 없는 사용자도 같은 경로로 404.
    const rows = await sql`update users set blocked = ${blocked} where id = ${id} and is_admin = false returning id`;
    if (rows.length === 0) return Response.json({ error: '대상을 찾을 수 없거나 관리자입니다.' }, { status: 404 });
    forget(id);
    return Response.json({ id, blocked });
  } catch (e) {
    return serverError(e);
  }
}

// Riot 캐시 전체 삭제. 다음 요청부터 Riot을 다시 호출한다.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (request.nextUrl.searchParams.get('resource') !== 'cache') {
    return Response.json({ error: 'Unknown resource' }, { status: 404 });
  }
  try {
    const sql = await db();
    const rows = await sql`with d as (delete from riot_cache returning 1) select count(*)::int as deleted from d`;
    return Response.json(rows[0]);
  } catch (e) {
    return serverError(e);
  }
}
