import { db } from './db.js';

// Riot 응답을 DB에 공유 캐시한다. 캐시 장애가 요청 자체를 막지 않도록 모든 오류는 미스/무시로 처리한다.
export async function cacheGet(key) {
  try {
    const sql = await db();
    const [row] = await sql`select status, body from riot_cache where key = ${key} and expires_at > now()`;
    return row ?? null;
  } catch (e) {
    console.error('cache get failed', e);
    return null;
  }
}

export async function cachePut(key, status, body, ttlSeconds) {
  try {
    const sql = await db();
    await sql`insert into riot_cache (key, status, body, expires_at)
      values (${key}, ${status}, ${JSON.stringify(body)}::jsonb, now() + make_interval(secs => ${ttlSeconds}))
      on conflict (key) do update
        set status = excluded.status, body = excluded.body, expires_at = excluded.expires_at`;
    // 만료 행 정리: 쓰기 50번에 한 번 정도만 수행
    if (Math.random() < 0.02) await sql`delete from riot_cache where expires_at < now()`;
  } catch (e) {
    console.error('cache put failed', e);
  }
}
