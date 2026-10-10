import { randomBytes } from 'node:crypto';
import { pool } from '../pool';

const PROVIDER = 'https://steamcommunity.com/openid/login';
const NAMESPACE = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = `${NAMESPACE}/identifier_select`;
const STEAM_ID_URL = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const TEN_MINUTES = 10 * 60 * 1000;
const REQUIRED_SIGNED = ['mode', 'op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce'];

export class InvalidSteamAssertionError extends Error {}
export class SteamAccountAlreadyLinkedError extends Error {}

export async function beginSteamLink(userId: string, callbackUrl: string, now = new Date()) {
  const state = randomBytes(32).toString('hex');
  const returnTo = new URL(callbackUrl);
  returnTo.searchParams.set('state', state);
  await pool.query('delete from steam_openid_challenges where expires_at < $1', [now]);
  await pool.query('delete from steam_openid_nonces where expires_at < $1', [now]);
  await pool.query(`insert into steam_openid_challenges (state, user_id, return_to, expires_at)
    values ($1, $2, $3, $4)`, [state, userId, returnTo.toString(), new Date(now.getTime() + TEN_MINUTES)]);
  const url = new URL(PROVIDER);
  url.search = new URLSearchParams({
    'openid.ns': NAMESPACE,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo.toString(),
    'openid.realm': `${returnTo.origin}/`,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  }).toString();
  return { state, url: url.toString() };
}

export async function finishSteamLink(
  userId: string,
  stateCookie: string | undefined,
  params: URLSearchParams,
  callbackOrigin: string,
  fetchFn: typeof fetch = fetch,
  now = new Date(),
): Promise<string> {
  const single = (key: string) => {
    const values = params.getAll(key);
    if (values.length !== 1) throw new InvalidSteamAssertionError('Missing or duplicate assertion field');
    return values[0];
  };
  const state = single('state');
  if (!stateCookie || state !== stateCookie || !/^[0-9a-f]{64}$/.test(state)) throw new InvalidSteamAssertionError('Invalid state');
  if (single('openid.ns') !== NAMESPACE || single('openid.mode') !== 'id_res' || single('openid.op_endpoint') !== PROVIDER) {
    throw new InvalidSteamAssertionError('Unexpected OpenID provider');
  }
  const claimedId = single('openid.claimed_id');
  const steamId = STEAM_ID_URL.exec(claimedId)?.[1];
  if (!steamId || single('openid.identity') !== claimedId) throw new InvalidSteamAssertionError('Invalid Steam ID');
  const returnTo = single('openid.return_to');
  let parsedReturnTo: URL;
  try { parsedReturnTo = new URL(returnTo); } catch { throw new InvalidSteamAssertionError('Invalid return URL'); }
  if (parsedReturnTo.origin !== callbackOrigin || parsedReturnTo.searchParams.get('state') !== state ||
      parsedReturnTo.pathname !== '/api/steam/activity/callback') throw new InvalidSteamAssertionError('Invalid return URL');
  const nonce = single('openid.response_nonce');
  const issuedAt = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(nonce) ? Date.parse(nonce.slice(0, 20)) : NaN;
  if (!Number.isFinite(issuedAt) || Math.abs(now.getTime() - issuedAt) > TEN_MINUTES) {
    throw new InvalidSteamAssertionError('Expired provider response');
  }
  const signed = single('openid.signed').split(',');
  if (signed.length !== new Set(signed).size || REQUIRED_SIGNED.some((field) => !signed.includes(field))) {
    throw new InvalidSteamAssertionError('Incomplete provider signature');
  }
  single('openid.sig');

  const verification = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('openid.')) {
      if (params.getAll(key).length !== 1) throw new InvalidSteamAssertionError('Duplicate assertion field');
      verification.set(key, value);
    }
  }
  verification.set('openid.mode', 'check_authentication');
  const response = await fetchFn(PROVIDER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verification,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !(await response.text()).split(/\r?\n/).includes('is_valid:true')) {
    throw new InvalidSteamAssertionError('Provider rejected assertion');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const challenge = (await client.query<{ return_to: string }>(`select return_to from steam_openid_challenges
      where state = $1 and user_id = $2 and expires_at >= $3 for update`, [state, userId, now])).rows[0];
    if (!challenge || challenge.return_to !== returnTo) throw new InvalidSteamAssertionError('Unknown challenge');
    const used = await client.query(`insert into steam_openid_nonces (nonce, expires_at)
      values ($1, $2) on conflict do nothing returning nonce`, [nonce, new Date(now.getTime() + TEN_MINUTES)]);
    if (!used.rowCount) throw new InvalidSteamAssertionError('Replayed provider response');
    await client.query(`insert into steam_members (steam_id, persona_name, owner_id)
      values ($1, $2, $3) on conflict (steam_id) do update set owner_id = excluded.owner_id`,
    [steamId, `Steam ${steamId}`, userId]);
    const linked = await client.query(`insert into steam_verified_accounts (steam_id, user_id)
      values ($1, $2) on conflict (steam_id) do update set verified_at = now()
      where steam_verified_accounts.user_id = excluded.user_id returning steam_id`, [steamId, userId]);
    // 검증된 계정이 다른 사용자에게 연결된 경우 소유권 변경도 롤백한다.
    if (!linked.rowCount) throw new SteamAccountAlreadyLinkedError();
    await client.query('delete from steam_openid_challenges where state = $1', [state]);
    await client.query('commit');
    return steamId;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
