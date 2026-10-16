import { requireUser } from '@/server/viewer';
import { parseBounded, serverError } from '@/server/http';
import { personalizedGames, personalizedSchema } from '@/server/steam/personalized';
import { TasteInputError } from '@/server/steam/tastes';
import { SteamNotConfiguredError, SteamUpstreamError } from '@/server/steam/client';

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const input = await parseBounded(request, personalizedSchema, 4096);
  if (!input.ok) return input.response;
  try { return Response.json(await personalizedGames(user.id, input.data, request.signal), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    if (error instanceof TasteInputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SteamNotConfiguredError) return Response.json({ error: 'Steam 연결 설정이 필요해요.' }, { status: 503 });
    if (error instanceof SteamUpstreamError) return Response.json({ error: 'Steam 조회를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: error.status === 504 ? 504 : 502 });
    return serverError(error, 'steam.personalized.POST');
  }
}
