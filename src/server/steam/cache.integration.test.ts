import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('Steam 공유 캐시와 오류 통계 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let client: typeof import('./client');
  const id = '76561198000999999';
  beforeAll(async () => {
    pool = await openTestDb();
    client = await import('./client');
    await pool.query(`delete from steam_cache where key like $1`, [`%${id}%`]);
  });
  afterAll(async () => {
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await pool.query(`delete from steam_cache where key like $1`, [`%${id}%`]);
    await pool.end();
  });
  const body = { response: { games: [{ appid: 10, name: 'Test', playtime_forever: 20 }] } };

  it('정상 응답을 재사용하고 만료되면 다시 호출한다. 키는 DB에 저장하지 않는다', async () => {
    vi.stubEnv('STEAM_API_KEY', 'do-not-store-api-key');
    const fetchFn = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetchFn);
    await client.getLibrary(id);
    await client.getLibrary(id);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const rows = (await pool.query(`select key, body from steam_cache where key like $1`, [`%${id}%`])).rows;
    expect(JSON.stringify(rows)).not.toContain('do-not-store-api-key');
    await pool.query(`update steam_cache set expires_at = now() - interval '1 second' where key like $1`, [`%${id}%`]);
    await client.getLibrary(id);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 500])('%i 오류는 캐시하지 않고 상태 코드만 남긴다', async (status) => {
    await pool.query(`delete from steam_cache where key like $1`, [`%${id}%`]);
    const before = (await pool.query(`select count(*)::int as n from steam_errors where code = $1`, [String(status)])).rows[0].n;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('secret-upstream-content', { status })));
    await expect(client.getLibrary(id)).rejects.toBeInstanceOf(client.SteamUpstreamError);
    expect((await pool.query(`select count(*)::int as n from steam_cache where key like $1`, [`%${id}%`])).rows[0].n).toBe(0);
    expect((await pool.query(`select count(*)::int as n from steam_errors where code = $1`, [String(status)])).rows[0].n).toBe(before + 1);
  });

  it('형식이 깨진 정상 상태 응답도 캐시하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{"unexpected":true}')));
    await expect(client.getLibrary(id)).rejects.toBeInstanceOf(client.SteamPayloadError);
    expect((await pool.query(`select count(*)::int as n from steam_cache where key like $1`, [`%${id}%`])).rows[0].n).toBe(0);
  });

  it('동시에 같은 계정을 조회해도 외부 호출은 하나다', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetchFn);
    await Promise.all([client.getLibrary(id), client.getLibrary(id), client.getLibrary(id)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
