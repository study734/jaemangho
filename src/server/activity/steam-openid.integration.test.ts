import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const STEAM_ID = '76561193000000011';
const NOW = new Date('2040-03-01T00:00:00Z');
const CALLBACK = 'https://jaemangho.example/api/steam/activity/callback';

function assertion(returnTo: string, nonce: string) {
  const id = `https://steamcommunity.com/openid/id/${STEAM_ID}`;
  return new URLSearchParams({
    state: new URL(returnTo).searchParams.get('state')!,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': id,
    'openid.identity': id,
    'openid.return_to': returnTo,
    'openid.response_nonce': nonce,
    'openid.signed': 'mode,op_endpoint,claimed_id,identity,return_to,response_nonce',
    'openid.sig': 'signed-by-provider',
  });
}

describe.skipIf(!testDbUrl)('Steam OpenID 확인 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let beginSteamLink: typeof import('./steam-openid').beginSteamLink;
  let finishSteamLink: typeof import('./steam-openid').finishSteamLink;

  beforeAll(async () => {
    pool = await openTestDb();
    ({ beginSteamLink, finishSteamLink } = await import('./steam-openid'));
    await pool.query(`delete from steam_openid_nonces where nonce like '2040-03-01T00:00:00Znonce%'`);
    await pool.query(`insert into "user" (id, name, email, "emailVerified") values
      ('toi_user1', '첫사용자', 'toi1@test.invalid', false),
      ('toi_user2', '둘사용자', 'toi2@test.invalid', false)`);
  });
  afterAll(async () => {
    await pool.query(`delete from steam_members where steam_id = $1`, [STEAM_ID]);
    await pool.query(`delete from "user" where id in ('toi_user1', 'toi_user2')`);
    await pool.query(`delete from steam_openid_nonces where nonce like '2040-03-01T00:00:00Znonce%'`);
    await pool.end();
  });

  it('Steam 직접 검증 뒤에만 소유자를 연결하고 위조·재사용·타인 연결을 막는다', async () => {
    const fakeSteam = vi.fn().mockResolvedValue(new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'));
    const started = await beginSteamLink('toi_user1', CALLBACK, NOW);
    const returnTo = new URL(started.url).searchParams.get('openid.return_to')!;
    const params = assertion(returnTo, '2040-03-01T00:00:00Znonce1');
    params.set('openid.op_endpoint', 'https://attacker.example/openid');
    await expect(finishSteamLink('toi_user1', started.state, params, 'https://jaemangho.example', fakeSteam, NOW)).rejects.toThrow();
    expect(fakeSteam).not.toHaveBeenCalled();

    params.set('openid.op_endpoint', 'https://steamcommunity.com/openid/login');
    expect(await finishSteamLink('toi_user1', started.state, params, 'https://jaemangho.example', fakeSteam, NOW)).toBe(STEAM_ID);
    expect(fakeSteam).toHaveBeenCalledWith('https://steamcommunity.com/openid/login', expect.objectContaining({ method: 'POST', redirect: 'error' }));
    expect((await pool.query(`select user_id from steam_verified_accounts where steam_id = $1`, [STEAM_ID])).rows[0].user_id).toBe('toi_user1');
    expect((await pool.query(`select owner_id from steam_members where steam_id = $1`, [STEAM_ID])).rows[0].owner_id).toBe('toi_user1');
    await expect(finishSteamLink('toi_user1', started.state, params, 'https://jaemangho.example', fakeSteam, NOW)).rejects.toThrow();

    const replay = await beginSteamLink('toi_user1', CALLBACK, NOW);
    const replayParams = assertion(new URL(replay.url).searchParams.get('openid.return_to')!, '2040-03-01T00:00:00Znonce1');
    await expect(finishSteamLink('toi_user1', replay.state, replayParams, 'https://jaemangho.example', fakeSteam, NOW)).rejects.toThrow();

    const other = await beginSteamLink('toi_user2', CALLBACK, NOW);
    const otherParams = assertion(new URL(other.url).searchParams.get('openid.return_to')!, '2040-03-01T00:00:00Znonce2');
    await expect(finishSteamLink('toi_user2', other.state, otherParams, 'https://jaemangho.example', fakeSteam, NOW)).rejects.toThrow();
    expect((await pool.query(`select user_id from steam_verified_accounts where steam_id = $1`, [STEAM_ID])).rows[0].user_id).toBe('toi_user1');

    const { setSteamOwner, removeSteamMember } = await import('../steam/roster');
    expect(await setSteamOwner(STEAM_ID, 'toi_user2', 'toi_user2')).toBe(false);
    expect(await removeSteamMember(STEAM_ID, 'toi_user2')).toBe(false);
    expect((await pool.query(`select owner_id from steam_members where steam_id = $1`, [STEAM_ID])).rows[0].owner_id).toBe('toi_user1');
  });
});
