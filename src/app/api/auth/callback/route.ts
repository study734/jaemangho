import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE, SESSION_MAX_AGE, STATE_COOKIE, cookieOptions, isGuildAdmin, makeToken,
} from '@/server/session';
import { recordLogin } from '@/server/users';

const DISCORD = 'https://discord.com/api';

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}
interface DiscordGuild {
  id: string;
  owner?: boolean;
  permissions?: string;
}

async function discordGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${DISCORD}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Discord ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// state 쿠키는 어떤 결과든 한 번 쓰고 지운다
const text = (status: number, message: string) => {
  const response = new NextResponse(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  response.cookies.delete(STATE_COOKIE);
  return response;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const savedState = (await cookies()).get(STATE_COOKIE)?.value;

  if (!code || !savedState || state !== savedState) {
    return text(400, '로그인 요청이 올바르지 않습니다. 처음부터 다시 시도해 주세요.');
  }

  try {
    const tokenRes = await fetch(`${DISCORD}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${request.nextUrl.origin}/api/auth/callback`,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const [user, guilds] = await Promise.all([
      discordGet<DiscordUser>('/users/@me', access_token),
      discordGet<DiscordGuild[]>('/users/@me/guilds', access_token),
    ]);

    const guild = guilds.find((g) => g.id === process.env.DISCORD_GUILD_ID);
    if (!guild) return text(403, '재망호 디스코드 서버 멤버만 접속할 수 있습니다.');

    const name = user.global_name ?? user.username;
    const { blocked } = await recordLogin({ id: user.id, name, username: user.username, isAdmin: isGuildAdmin(guild) });
    if (blocked) return text(403, '차단된 계정입니다. 관리자에게 문의해 주세요.');

    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
    const response = NextResponse.redirect(new URL('/', request.nextUrl.origin));
    response.cookies.set(SESSION_COOKIE, makeToken({ id: user.id, name, exp }), cookieOptions(SESSION_MAX_AGE));
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (e) {
    console.error(e);
    return text(502, '디스코드 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
