import {
  SESSION_COOKIE, SESSION_MAX_AGE, STATE_COOKIE,
  isGuildAdmin, makeToken, parseCookies, redirect, redirectUri, setCookie,
} from '../_lib/auth.js';
import { recordLogin } from '../_lib/users.js';

const DISCORD = 'https://discord.com/api';

async function discordGet(path, accessToken) {
  const r = await fetch(`${DISCORD}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Discord ${path} failed: ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  const { code, state } = req.query;
  const savedState = parseCookies(req)[STATE_COOKIE];
  setCookie(res, STATE_COOKIE, '', 0);

  if (typeof code !== 'string' || !savedState || state !== savedState) {
    return res.status(400).send('로그인 요청이 올바르지 않습니다. 처음부터 다시 시도해 주세요.');
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
        redirect_uri: redirectUri(req),
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    const [user, guilds] = await Promise.all([
      discordGet('/users/@me', access_token),
      discordGet('/users/@me/guilds', access_token),
    ]);

    const guild = guilds.find((g) => g.id === process.env.DISCORD_GUILD_ID);
    if (!guild) {
      return res.status(403).send('재망호 디스코드 서버 멤버만 접속할 수 있습니다.');
    }

    const name = user.global_name ?? user.username;
    const { blocked } = await recordLogin({ id: user.id, name, username: user.username, isAdmin: isGuildAdmin(guild) });
    if (blocked) {
      return res.status(403).send('차단된 계정입니다. 관리자에게 문의해 주세요.');
    }

    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
    setCookie(res, SESSION_COOKIE, makeToken({ id: user.id, name, exp }), SESSION_MAX_AGE);
    redirect(res, '/');
  } catch (e) {
    console.error(e);
    res.status(502).send('디스코드 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
