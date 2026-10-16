import type { NextRequest } from 'next/server';
import { parseQuery, serverError } from '@/server/http';
import { SteamNotConfiguredError, SteamUpstreamError } from '@/server/steam/client';
import { recommendGames, recommendationsQuerySchema } from '@/server/steam/recommendations';
import { requireSteamUser } from '@/server/steam/consent';

export async function GET(request: NextRequest) {
  const user = await requireSteamUser();
  if (user instanceof Response) return user;
  const query = parseQuery(request.nextUrl.searchParams, recommendationsQuerySchema);
  if (!query.ok) return query.response;
  try {
    const result = await recommendGames(query.data.ids, query.data.preference, query.data.scope, request.signal);
    if ('unknownIds' in result) return Response.json({ error: 'Unknown members' }, { status: 400 });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SteamNotConfiguredError) return Response.json({ error: 'Steam is not configured' }, { status: 503 });
    if (error instanceof SteamUpstreamError) return Response.json({ error: 'Steam unavailable' }, { status: 502 });
    return serverError(error, 'api/steam/recommendations.GET');
  }
}
