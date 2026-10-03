import { db } from './_lib/db.js';
import { requireAdmin } from './_lib/guard.js';
import { forget } from './_lib/users.js';

// 관리자 전용 API. 리소스별 파일을 따로 두지 않고 ?resource= 로 나눈다(함수 파일 수를 늘리지 않기 위함).
const handlers = {
  async status(sql, req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const [[cache], [database], [counts], errorsByStatus, recentErrors, stats] = await Promise.all([
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
    return res.status(200).json({ cache, database, counts, errorsByStatus, recentErrors, stats });
  },

  async users(sql, req, res, admin) {
    if (req.method === 'GET') {
      const rows = await sql`select id, name, username, is_admin as "isAdmin", blocked, login_count as "loginCount",
        first_login as "firstLogin", last_login as "lastLogin"
        from users order by last_login desc`;
      return res.status(200).json(rows);
    }
    if (req.method === 'PUT') {
      const { id, blocked } = req.body ?? {};
      if (typeof id !== 'string' || !/^\d{1,25}$/.test(id) || typeof blocked !== 'boolean') {
        return res.status(400).json({ error: 'Invalid request' });
      }
      if (id === admin.id) return res.status(400).json({ error: '자기 자신은 차단할 수 없습니다.' });
      // 관리자는 차단할 수 없다(is_admin = false 조건). 없는 사용자도 같은 경로로 404.
      const rows = await sql`update users set blocked = ${blocked} where id = ${id} and is_admin = false returning id`;
      if (rows.length === 0) return res.status(404).json({ error: '대상을 찾을 수 없거나 관리자입니다.' });
      forget(id);
      return res.status(200).json({ id, blocked });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  },

  // Riot 캐시 전체 삭제. 다음 요청부터 Riot을 다시 호출한다.
  async cache(sql, req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const [row] = await sql`with d as (delete from riot_cache returning 1) select count(*)::int as deleted from d`;
    return res.status(200).json(row);
  },

  async members(sql, req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const rows = await sql`select m.id, m.game_name as "gameName", m.tag_line as "tagLine",
      m.created_at as "createdAt", m.created_by as "createdBy", coalesce(u.name, m.created_by_name) as "createdByName"
      from members m left join users u on u.id = m.created_by order by m.created_at desc`;
    return res.status(200).json(rows);
  },
};

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const run = handlers[req.query.resource];
  if (!run) return res.status(404).json({ error: 'Unknown resource' });

  try {
    return await run(await db(), req, res, admin);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
