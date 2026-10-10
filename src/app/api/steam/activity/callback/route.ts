import { NextResponse, type NextRequest } from 'next/server';
import { finishSteamLink, SteamAccountAlreadyLinkedError } from '@/server/activity/steam-openid';
import { requireUser } from '@/server/viewer';

const COOKIE = 'jmh_steam_link_state';

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  let result = 'verified';
  try {
    await finishSteamLink(user.id, request.cookies.get(COOKIE)?.value, request.nextUrl.searchParams, request.nextUrl.origin);
  } catch (error) {
    result = error instanceof SteamAccountAlreadyLinkedError ? 'already-linked' : 'failed';
  }
  const destination = new URL('/steam', request.url);
  destination.searchParams.set('steam-link', result);
  const response = NextResponse.redirect(destination);
  response.cookies.set(COOKIE, '', {
    httpOnly: true, secure: destination.protocol === 'https:', sameSite: 'lax',
    path: '/api/steam/activity', maxAge: 0,
  });
  return response;
}
