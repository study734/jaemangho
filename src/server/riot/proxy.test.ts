import { describe, expect, it, vi } from 'vitest';
import { proxyRiot, type RiotRequest, type RiotStore } from './proxy';

// 메모리 가짜 저장소: 무엇이 저장/기록되었는지 검증한다
function fakeStore(initial: Record<string, { status: number; body: unknown }> = {}) {
  const data = new Map(Object.entries(initial));
  const calls = { put: [] as unknown[][], errors: [] as unknown[][], bumps: [] as string[] };
  const store: RiotStore = {
    get: async (key) => data.get(key) ?? null,
    put: async (key, status, body, ttl) => { calls.put.push([key, status, body, ttl]); data.set(key, { status, body }); },
    bump: async (kind) => { calls.bumps.push(kind); },
    logError: async (status, path) => { calls.errors.push([status, path]); },
  };
  return { store, calls };
}

const fakeFetch = (status: number, body: unknown) =>
  vi.fn(async () => ({ status, json: async () => body }) as Response) as unknown as typeof fetch;

const req = (over: Partial<RiotRequest> = {}): RiotRequest => ({
  region: 'kr',
  path: '/lol/league/v4/entries/by-puuid/abc',
  params: new URLSearchParams(),
  route: { re: /./, ttl: 300 },
  ...over,
});

describe('proxyRiot', () => {
  it('캐시에 있으면 Riot을 부르지 않고 HIT로 응답한다', async () => {
    const { store, calls } = fakeStore({ 'kr/lol/league/v4/entries/by-puuid/abc?': { status: 200, body: [{ tier: 'GOLD' }] } });
    const f = fakeFetch(200, []);
    const r = await proxyRiot(req(), { apiKey: 'K', store, fetchFn: f });
    expect(r).toEqual({ status: 200, body: [{ tier: 'GOLD' }], cache: 'HIT' });
    expect(f).not.toHaveBeenCalled();
    expect(calls.bumps).toEqual(['hit']);
  });

  it('캐시에 없으면 키를 헤더로 보내 호출하고, 성공 응답은 엔드포인트 TTL로 저장한다', async () => {
    const { store, calls } = fakeStore();
    const f = fakeFetch(200, [{ tier: 'GOLD' }]);
    const r = await proxyRiot(req({ params: new URLSearchParams({ count: '3' }) }), { apiKey: 'SECRET', store, fetchFn: f });
    expect(r).toEqual({ status: 200, body: [{ tier: 'GOLD' }], cache: 'MISS' });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/abc?count=3');
    expect(init.headers).toEqual({ 'X-Riot-Token': 'SECRET' });
    expect(url).not.toContain('SECRET'); // 키는 주소에 넣지 않는다
    expect(calls.put).toEqual([['kr/lol/league/v4/entries/by-puuid/abc?count=3', 200, [{ tier: 'GOLD' }], 300]]);
    expect(calls.bumps).toEqual(['miss']);
  });

  it('404는 짧게(최대 60초) 캐시하고 오류로 기록하지 않는다', async () => {
    const { store, calls } = fakeStore();
    const r = await proxyRiot(req(), { apiKey: 'K', store, fetchFn: fakeFetch(404, { status: { status_code: 404 } }) });
    expect(r.status).toBe(404);
    expect(calls.put[0][3]).toBe(60);
    expect(calls.errors).toEqual([]);
  });

  it('TTL이 30초인 엔드포인트의 404는 30초를 넘기지 않는다', async () => {
    const { store, calls } = fakeStore();
    await proxyRiot(req({ route: { re: /./, ttl: 30 } }), { apiKey: 'K', store, fetchFn: fakeFetch(404, {}) });
    expect(calls.put[0][3]).toBe(30);
  });

  it.each([401, 403, 429, 500, 503])('%i는 캐시하지 않고 오류로 기록한다', async (status) => {
    const { store, calls } = fakeStore();
    const r = await proxyRiot(req(), { apiKey: 'K', store, fetchFn: fakeFetch(status, { error: 'x' }) });
    expect(r.status).toBe(status);
    expect(r.cache).toBeUndefined();
    expect(calls.put).toEqual([]);
    expect(calls.errors).toEqual([[status, '/lol/league/v4/entries/by-puuid/abc']]);
  });

  it('네트워크 오류는 500으로 돌려주고 캐시하지 않고 기록한다', async () => {
    const { store, calls } = fakeStore();
    const f = vi.fn(async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch;
    const r = await proxyRiot(req(), { apiKey: 'K', store, fetchFn: f });
    expect(r).toEqual({ status: 500, body: { error: 'socket hang up' } });
    expect(calls.put).toEqual([]);
    expect(calls.errors).toHaveLength(1);
  });

  it('키가 없으면 Riot을 부르지 않고 500', async () => {
    const { store } = fakeStore();
    const f = fakeFetch(200, {});
    const r = await proxyRiot(req(), { apiKey: undefined, store, fetchFn: f });
    expect(r.status).toBe(500);
    expect(f).not.toHaveBeenCalled();
  });

  it('캐시된 응답은 키가 없어도 돌려준다', async () => {
    const { store } = fakeStore({ 'kr/lol/league/v4/entries/by-puuid/abc?': { status: 200, body: [] } });
    expect((await proxyRiot(req(), { apiKey: undefined, store })).cache).toBe('HIT');
  });
});
