import { db } from '../db';

const configured = () => !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export async function steamCacheGet(key: string): Promise<unknown | undefined> {
  if (!configured()) return undefined;
  try {
    const sql = await db();
    const [row] = await sql`select body from steam_cache where key = ${key} and expires_at > now()`;
    return row?.body;
  } catch {
    console.error('steam cache read failed');
    return undefined;
  }
}

export async function steamCachePut(key: string, body: unknown, ttl: number) {
  if (!configured()) return;
  try {
    const sql = await db();
    await sql`insert into steam_cache (key, body, expires_at) values (${key}, ${JSON.stringify(body)}::jsonb, now() + make_interval(secs => ${ttl}))
      on conflict (key) do update set body = excluded.body, expires_at = excluded.expires_at`;
  } catch {
    console.error('steam cache write failed');
  }
}

export async function steamStat(kind: 'hit' | 'miss' | 'error', endpoint?: string, code?: string) {
  if (!configured()) return;
  try {
    const sql = await db();
    await sql`insert into steam_stats (day, hits, misses, errors)
      values ((now() at time zone 'Asia/Seoul')::date, ${kind === 'hit' ? 1 : 0}, ${kind === 'miss' ? 1 : 0}, ${kind === 'error' ? 1 : 0})
      on conflict (day) do update set hits = steam_stats.hits + excluded.hits, misses = steam_stats.misses + excluded.misses, errors = steam_stats.errors + excluded.errors`;
    if (kind === 'error') await sql`insert into steam_errors (endpoint, code) values (${endpoint ?? 'unknown'}, ${code ?? 'network'})`;
  } catch {
    console.error('steam statistics write failed');
  }
}

export async function purgeSteamCache() {
  const sql = await db();
  const [row] = await sql`with d as (delete from steam_cache returning 1) select count(*)::int as deleted from d`;
  return { deleted: row.deleted as number };
}
