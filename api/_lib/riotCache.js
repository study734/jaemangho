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

// 관리자 대시보드용 Riot 오류 기록(401/403/429/5xx). 기록 실패는 무시한다.
export async function logRiotError(status, path) {
  try {
    const sql = await db();
    await sql`insert into riot_errors (status, path) values (${status}, ${path})`;
    if (Math.random() < 0.02) await sql`delete from riot_errors where at < now() - interval '7 days'`;
  } catch (e) {
    console.error('riot error log failed', e);
  }
}

// 하루(한국 시간 기준) 단위 호출 통계. hit = 캐시로 응답, miss = Riot을 실제로 호출. 실패는 무시한다.
export async function bumpStat(kind) {
  try {
    const sql = await db();
    if (kind === 'hit') {
      await sql`insert into riot_stats (day, hits) values ((now() at time zone 'Asia/Seoul')::date, 1)
        on conflict (day) do update set hits = riot_stats.hits + 1`;
    } else {
      await sql`insert into riot_stats (day, misses) values ((now() at time zone 'Asia/Seoul')::date, 1)
        on conflict (day) do update set misses = riot_stats.misses + 1`;
    }
  } catch (e) {
    console.error('stat bump failed', e);
  }
}
