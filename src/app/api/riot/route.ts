import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseQuery } from '@/server/http';
import { proxyRiot } from '@/server/riot/proxy';
import { routeFor } from '@/server/riot/routes';
import { requireUser } from '@/server/viewer';

const querySchema = z.object({
  region: z.string().min(1),
  path: z.string().min(1).max(300),
  count: z.coerce.number().int().min(0).max(100).optional(),
  start: z.coerce.number().int().min(0).max(1000).optional(),
});

// 로그인한 사용자의 Riot 호출을 서버 키로 대신 보낸다. 같은 오리진에서만 호출되므로 CORS 헤더는 없다.
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const query = parseQuery(request.nextUrl.searchParams, querySchema);
  if (!query.ok) return query.response;
  const { region, path, count, start } = query.data;

  const route = routeFor(path);
  if (!route) return Response.json({ error: 'Path not allowed' }, { status: 403 });

  // 전달하는 파라미터는 숫자로 검증된 count/start뿐이다 (캐시 키 순서 고정)
  const params = new URLSearchParams();
  if (count !== undefined) params.set('count', String(count));
  if (start !== undefined) params.set('start', String(start));

  const result = await proxyRiot(
    { region: region === 'asia' ? 'asia' : 'kr', path, params, route },
    { apiKey: process.env.RIOT_API_KEY }
  );
  return Response.json(result.body, {
    status: result.status,
    headers: result.cache ? { 'X-Cache': result.cache } : undefined,
  });
}
