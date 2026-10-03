import { createHmac, timingSafeEqual } from 'node:crypto';

// 세션 = HMAC 서명된 httpOnly 쿠키. 서버에 저장하는 상태가 없다.
// ponytail: 서버측 폐기(로그아웃 강제) 불가, 만료(7일)까지 유효. 필요하면 DB 세션 테이블로 전환.
export const SESSION_COOKIE = 'jmh_session';
export const STATE_COOKIE = 'jmh_state';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export interface Session {
  id: string;
  name: string;
  exp: number; // epoch seconds
}

const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return value;
};
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function makeToken(payload: Session): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token: string | undefined): Session | null {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

// 디스코드 서버 소유자이거나 Administrator(0x8) 권한이 있으면 관리자.
// guild는 /users/@me/guilds 항목({ owner, permissions }).
const ADMINISTRATOR = 8n;
export const isGuildAdmin = (guild: { owner?: boolean; permissions?: string }) =>
  guild.owner === true || (BigInt(guild.permissions ?? 0) & ADMINISTRATOR) !== 0n;
