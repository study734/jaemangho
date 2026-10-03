import type { NextRequest } from 'next/server';
import { bumpStat, cacheGet, cachePut, logRiotError } from '@/server/riot/cache';
import { routeFor } from '@/server/riot/routes';
import { requireUser } from '@/server/viewer';

const FORWARD_PARAMS = ['count', 'start'];

// 로그인한 사용자의 Riot 호출을 서버 키로 대신 보낸다. 같은 오리진에서만 호출되므로 CORS 헤더는 없다.
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const query = request.nextUrl.searchParams;
  const region = query.get('region');
  const path = query.get('path');
  if (!region || !path) return Response.json({ error: 'Missing region or path parameter' }, { status: 400 });

  const route = routeFor(path);
  if (!route) return Response.json({ error: 'Path not allowed' }, { status: 403 });

  const targetRegion = region === 'asia' ? 'asia' : 'kr';
  const params = new URLSearchParams();
  for (const key of FORWARD_PARAMS) {
    const value = query.get(key);
    if (value !== null) params.set(key, value);
  }

  // 크루원 전원이 같은 응답을 공유하도록 서버(DB)에 캐시한다. Riot rate limit을 아끼기 위함.
  const cacheKey = `${targetRegion}${path}?${params}`;
  const hit = await cacheGet(cacheKey);
  if (hit) {
    await bumpStat('hit');
    return Response.json(hit.body, { status: hit.status, headers: { 'X-Cache': 'HIT' } });
  }

  // 키는 서버 환경변수에서만 읽는다
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) return Response.json({ error: 'Server is missing RIOT_API_KEY' }, { status: 500 });

  await bumpStat('miss');
  let status = 500;
  let data: unknown;
  try {
    const qs = params.toString();
    const res = await fetch(`https://${targetRegion}.api.riotgames.com${encodeURI(path)}${qs ? `?${qs}` : ''}`, {
      headers: { 'X-Riot-Token': apiKey },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    status = res.status;
    data = await res.json().catch(() => ({}));
  } catch (error) {
    data = { error: error instanceof Error ? error.message : 'Upstream error' };
  }

  if (status >= 200 && status < 300) {
    await cachePut(cacheKey, status, data, route.ttl);
    return Response.json(data, { status, headers: { 'X-Cache': 'MISS' } });
  }
  // 404(없는 소환사, 게임 중 아님)만 짧게 캐시한다. 401/403/429/5xx는 캐시하지 않는다.
  if (status === 404) await cachePut(cacheKey, status, data, Math.min(route.ttl, 60));
  else await logRiotError(status, path);
  return Response.json(data, { status });
}
