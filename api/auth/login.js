import { randomBytes } from 'node:crypto';
import { STATE_COOKIE, redirect, redirectUri, setCookie } from '../_lib/auth.js';

export default function handler(req, res) {
  const state = randomBytes(16).toString('hex');
  setCookie(res, STATE_COOKIE, state, 600);
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  redirect(res, `https://discord.com/oauth2/authorize?${params}`);
}
