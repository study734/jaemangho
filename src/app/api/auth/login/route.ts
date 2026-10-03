import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { STATE_COOKIE, cookieOptions } from '@/server/session';

export function GET(request: NextRequest) {
  const state = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: `${request.nextUrl.origin}/api/auth/callback`,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  const response = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`);
  response.cookies.set(STATE_COOKIE, state, cookieOptions(600));
  return response;
}
