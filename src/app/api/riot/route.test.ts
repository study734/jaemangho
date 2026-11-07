import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 브라우저 클라이언트가 만든 실제 주소 -> 이 라우트 -> 허용 목록 -> 프록시 -> Riot 주소까지 한 번에 통과시킨다.
// E2E는 브라우저에서 /api/riot을 가짜 응답으로 대신하므로(e2e/fixtures.ts) 이 연결은 여기서만 검증된다.
// 바꾸는 것은 로그인 판정, Riot 캐시 저장소(DB), 외부 fetch뿐이다.
const fakes = vi.hoisted(() => ({ user: vi.fn(), cache: new Map<string, { status: number; body: unknown }>(), errors: [] as unknown[][] }));
vi.mock('@/server/viewer', () => ({ requireUser: fakes.user }));
vi.mock('@/server/http', () => import('../../../server/http'));
vi.mock('@/server/riot/proxy', () => import('../../../server/riot/proxy'));
vi.mock('@/server/riot/routes', () => import('../../../server/riot/routes'));
vi.mock('../../../server/riot/cache', () => ({
  cacheGet: async (key: string) => fakes.cache.get(key) ?? null,
  cachePut: async (key: string, status: number, body: unknown) => { fakes.cache.set(key, { status, body }); },
  bumpStat: async () => {},
  logRiotError: async (status: number, path: string) => { fakes.errors.push([status, path]); },
}));
import { NextRequest } from 'next/server';
import { createRiotClient } from '../../../features/lol';
import { GET } from './route';

const riotFetch = vi.fn<typeof fetch>();
const call = (url: string) => GET(new NextRequest(new URL(url, 'https://example.com')));

// 브라우저 클라이언트(createRiotClient)가 계정 조회에 쓰는 /api/riot 주소를 그대로 얻는다.
async function browserAccountUrl(name: string, tag: string) {
  const urls: string[] = [];
  await createRiotClient(async (url) => { urls.push(url); return { puuid: 'p' } as never; }).account(name, tag);
  return urls[0];
}

beforeEach(() => {
  fakes.cache.clear(); fakes.errors.length = 0; riotFetch.mockReset();
  fakes.user.mockResolvedValue({ id: 'viewer' });
  riotFetch.mockResolvedValue(Response.json({ puuid: 'PUUID' }));
  vi.stubGlobal('fetch', riotFetch);
  vi.stubEnv('RIOT_API_KEY', 'RGAPI-route-test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('/api/riot', () => {
  it.each([
    ['오채', 'KR1', '/riot/account/v1/accounts/by-riot-id/%EC%98%A4%EC%B1%84/KR1'],
    ['Hide on bush', 'KR1', '/riot/account/v1/accounts/by-riot-id/Hide%20on%20bush/KR1'],
    ['Faker', 'T1', '/riot/account/v1/accounts/by-riot-id/Faker/T1'],
  ])('브라우저가 보낸 Riot ID %s#%s를 한 번만 인코딩해 asia 계정 API로 보낸다', async (name, tag, riotPath) => {
    const response = await call(await browserAccountUrl(name, tag));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ puuid: 'PUUID' });
    expect(riotFetch).toHaveBeenCalledOnce();
    const [url, init] = riotFetch.mock.calls[0];
    expect(String(url)).toBe(`https://asia.api.riotgames.com${riotPath}`);
    expect(new Headers(init?.headers).get('X-Riot-Token')).toBe('RGAPI-route-test');
  });

  it('같은 계정의 두 번째 요청은 캐시로 응답하고 Riot을 다시 부르지 않는다', async () => {
    const url = await browserAccountUrl('오채', 'KR1');
    await call(url);
    const second = await call(url);
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(riotFetch).toHaveBeenCalledOnce();
  });

  it('로그인하지 않았거나 차단된 사용자는 Riot을 부르지 않는다', async () => {
    const url = await browserAccountUrl('오채', 'KR1');
    for (const status of [401, 403]) {
      fakes.user.mockResolvedValue(new Response(null, { status }));
      expect((await call(url)).status).toBe(status);
    }
    expect(riotFetch).not.toHaveBeenCalled();
  });

  it('허용 목록에 없는 경로와 상위 경로 이동은 403으로 거부하고 Riot을 부르지 않는다', async () => {
    for (const path of ['/lol/status/v4/platform-data', '/riot/account/v1/accounts/by-riot-id/../../x/KR1']) {
      expect((await call(`/api/riot?region=asia&path=${encodeURIComponent(path)}`)).status).toBe(403);
    }
    expect(riotFetch).not.toHaveBeenCalled();
  });

  it('Riot 404는 그대로 전달하고, 키 만료(403)는 응답에 키를 노출하지 않고 오류로 기록한다', async () => {
    riotFetch.mockResolvedValueOnce(Response.json({ status: { status_code: 404 } }, { status: 404 }));
    expect((await call(await browserAccountUrl('없는닉네임', 'KR1'))).status).toBe(404);
    riotFetch.mockResolvedValue(Response.json({ status: { status_code: 403 } }, { status: 403 }));
    const expired = await call('/api/riot?region=kr&path=' + encodeURIComponent('/lol/league/v4/entries/by-puuid/abc'));
    expect(expired.status).toBe(403);
    expect(await expired.text()).not.toContain('RGAPI-route-test');
    expect(fakes.errors).toEqual([[403, '/lol/league/v4/entries/by-puuid/abc']]);
  });
});
