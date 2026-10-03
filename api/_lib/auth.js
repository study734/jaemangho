import { createHmac, timingSafeEqual } from 'node:crypto';

// 세션 = HMAC 서명된 httpOnly 쿠키. 서버에 저장하는 상태가 없다.
// ponytail: 서버측 폐기(로그아웃 강제) 불가, 만료(7일)까지 유효. 필요하면 DB 세션 테이블로 전환.
export const SESSION_COOKIE = 'jmh_session';
export const STATE_COOKIE = 'jmh_state';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

const secret = () => {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
  return process.env.SESSION_SECRET;
};
const sign = (body) => createHmac('sha256', secret()).update(body).digest('base64url');

export function makeToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([k]) => k)
  );
}

export function setCookie(res, name, value, maxAge) {
  const cookie = `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  const prev = res.getHeader('Set-Cookie') ?? [];
  res.setHeader('Set-Cookie', [...[].concat(prev), cookie]);
}

export const getSession = (req) => readToken(parseCookies(req)[SESSION_COOKIE]);

// 세션이 없으면 401을 보내고 null을 돌려준다.
export function requireSession(req, res) {
  const session = getSession(req);
  if (!session) res.status(401).json({ error: 'Unauthorized' });
  return session;
}

export function redirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  return `${proto}://${req.headers.host}/api/auth/callback`;
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}
