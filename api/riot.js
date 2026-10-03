import axios from 'axios';
import { requireSession } from './_lib/auth.js';
import { cacheGet, cachePut } from './_lib/riotCache.js';
import { routeFor } from './_lib/riotRoutes.js';

const FORWARD_PARAMS = ['count', 'start'];

// 같은 오리진에서만 호출되므로 CORS 헤더는 의도적으로 설정하지 않는다.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireSession(req, res)) return;

  const { region, path } = req.query;

  if (typeof region !== 'string' || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing region or path parameter' });
  }
  const route = routeFor(path);
  if (!route) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  const targetRegion = region === 'asia' ? 'asia' : 'kr';
  const params = Object.fromEntries(
    FORWARD_PARAMS.filter((k) => typeof req.query[k] === 'string').map((k) => [k, req.query[k]])
  );

  // 크루원 전원이 같은 응답을 공유하도록 서버(DB)에 캐시한다. Riot rate limit을 아끼기 위함.
  const cacheKey = `${targetRegion}${path}?${new URLSearchParams(params)}`;
  const hit = await cacheGet(cacheKey);
  if (hit) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(hit.status).json(hit.body);
  }

  // 키는 서버 환경변수에서만 읽는다 (클라이언트가 보낸 키는 무시)
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing RIOT_API_KEY' });
  }

  try {
    const response = await axios.get(`https://${targetRegion}.api.riotgames.com${encodeURI(path)}`, {
      params,
      headers: { 'X-Riot-Token': apiKey },
      timeout: 10000,
    });
    await cachePut(cacheKey, response.status, response.data, route.ttl);
    res.setHeader('X-Cache', 'MISS');
    return res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: error.message };
    // 404(없는 소환사, 게임 중 아님)만 짧게 캐시한다. 401/403/429/5xx는 캐시하지 않는다.
    if (status === 404) await cachePut(cacheKey, status, data, Math.min(route.ttl, 60));
    return res.status(status).json(data);
  }
}
