import { db } from './db.js';

// 차단/관리자 상태는 DB가 기준이다. 요청마다 조회하되 인스턴스 메모리에 30초 캐시한다.
// ponytail: 다른 서버리스 인스턴스에는 최대 30초 뒤에 반영된다. 즉시성이 필요하면 캐시를 없앤다.
const TTL_MS = 30_000;
const memo = new Map();

// 조회 실패(DB 장애)는 null로 돌려준다: 차단 확인은 열어두고(fail-open), 관리자 확인은 거부(fail-closed)된다.
export async function getUser(id) {
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
  try {
    const sql = await db();
    const [user] = await sql`select id, name, is_admin, blocked from users where id = ${id}`;
    memo.set(id, { user: user ?? null, at: Date.now() });
    return user ?? null;
  } catch (e) {
    console.error('user lookup failed', e);
    return null;
  }
}

export const forget = (id) => memo.delete(id);

export async function recordLogin({ id, name, username, isAdmin }) {
  const sql = await db();
  const [row] = await sql`insert into users (id, name, username, is_admin) values (${id}, ${name}, ${username}, ${isAdmin})
    on conflict (id) do update
      set name = excluded.name, username = excluded.username, is_admin = excluded.is_admin,
          login_count = users.login_count + 1, last_login = now()
    returning blocked`;
  forget(id);
  return row;
}
