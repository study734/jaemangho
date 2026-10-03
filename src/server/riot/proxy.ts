import { bumpStat, cacheGet, cachePut, logRiotError } from './cache';
import type { RiotRoute } from './routes';

// 이음새: 캐시와 통계 저장소. 운영에서는 DB, 테스트에서는 메모리 가짜를 끼운다.
export interface RiotStore {
  get(key: string): Promise<{ status: number; body: unknown } | null>;
  put(key: string, status: number, body: unknown, ttlSeconds: number): Promise<void>;
  bump(kind: 'hit' | 'miss'): Promise<void>;
  logError(status: number, path: string): Promise<void>;
}

export const dbStore: RiotStore = { get: cacheGet, put: cachePut, bump: bumpStat, logError: logRiotError };

export interface RiotRequest {
  region: 'kr' | 'asia';
  path: string;
  params: URLSearchParams;
  route: RiotRoute;
}

export interface RiotResult {
  status: number;
  body: unknown;
  cache?: 'HIT' | 'MISS';
}

// 크루원 전원이 같은 응답을 공유하도록 캐시한다 (Riot rate limit을 아끼기 위함).
// 캐시하는 것: 성공 응답(엔드포인트별 TTL)과 404(최대 60초: 없는 소환사, 게임 중 아님).
// 캐시하지 않는 것: 401/403/429/5xx와 네트워크 오류. 이런 오류는 기록만 한다.
export async function proxyRiot(
  req: RiotRequest,
  deps: { apiKey: string | undefined; store?: RiotStore; fetchFn?: typeof fetch }
): Promise<RiotResult> {
  const store = deps.store ?? dbStore;
  const fetchFn = deps.fetchFn ?? fetch;

  const cacheKey = `${req.region}${req.path}?${req.params}`;
  const hit = await store.get(cacheKey);
  if (hit) {
    await store.bump('hit');
    return { status: hit.status, body: hit.body, cache: 'HIT' };
  }

  if (!deps.apiKey) return { status: 500, body: { error: 'Server is missing RIOT_API_KEY' } };

  await store.bump('miss');
  let status = 500;
  let body: unknown;
  try {
    const qs = req.params.toString();
    const res = await fetchFn(`https://${req.region}.api.riotgames.com${encodeURI(req.path)}${qs ? `?${qs}` : ''}`, {
      headers: { 'X-Riot-Token': deps.apiKey },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch (error) {
    body = { error: error instanceof Error ? error.message : 'Upstream error' };
  }

  if (status >= 200 && status < 300) {
    await store.put(cacheKey, status, body, req.route.ttl);
    return { status, body, cache: 'MISS' };
  }
  if (status === 404) await store.put(cacheKey, status, body, Math.min(req.route.ttl, 60));
  else await store.logError(status, req.path);
  return { status, body };
}
