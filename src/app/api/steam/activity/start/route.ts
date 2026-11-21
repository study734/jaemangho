import { NextResponse, type NextRequest } from 'next/server';
import { beginSteamLink } from '@/server/activity/steam-openid';
import { serverError } from '@/server/http';
import { requireUser } from '@/server/viewer';

const COOKIE = 'jmh_steam_link_state';

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol !== 'https:') {
    return Response.json({ error: 'HTTPS required' }, { status: 400 });
  }
  try {
    const callback = new URL('/api/steam/activity/callback', request.url);
    // 디스코드 게임추천 준비 화면(/connect/steam)에서 시작했으면 끝난 뒤 그 화면으로 돌아간다. 정해진 값만 받는다.
    if (request.nextUrl.searchParams.get('from') === 'connect') callback.searchParams.set('from', 'connect');
    const { state, url } = await beginSteamLink(user.id, callback.toString());
    const response = NextResponse.redirect(url);
    response.cookies.set(COOKIE, state, {
      httpOnly: true, secure: callback.protocol === 'https:', sameSite: 'lax',
      path: '/api/steam/activity', maxAge: 600,
    });
    return response;
  } catch (error) { return serverError(error, 'api/steam/activity/start.GET'); }
}
