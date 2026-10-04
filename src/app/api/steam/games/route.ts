import type { NextRequest } from 'next/server';
import { parseQuery, serverError } from '@/server/http';
import { SteamNotConfiguredError, SteamUpstreamError } from '@/server/steam/client';
import { compareGames, gamesQuerySchema } from '@/server/steam/games';
import { requireUser } from '@/server/viewer';

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const query = parseQuery(request.nextUrl.searchParams, gamesQuerySchema);
  if (!query.ok) return query.response;
  try {
    const result = await compareGames(query.data.ids, query.data.mode);
    if ('unknownIds' in result) return Response.json({ error: 'Unknown members' }, { status: 400 });
    return Response.json(result);
  } catch (e) {
    if (e instanceof SteamNotConfiguredError) return Response.json({ error: 'Steam is not configured' }, { status: 503 });
    if (e instanceof SteamUpstreamError) return Response.json({ error: 'Steam unavailable' }, { status: 502 });
    return serverError(e);
  }
}
