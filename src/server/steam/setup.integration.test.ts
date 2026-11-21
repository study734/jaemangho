import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

// intent/0005 R2·R3: /connect/steam이 보여 줄 준비 상태.
describe.skipIf(!testDbUrl)('Steam 게임추천 준비 상태 (격리 DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let setup: typeof import('./setup');
  const steamId = '76561199000005001';
  const cleanup = async () => {
    await pool.query('delete from steam_feature_consents where user_id = $1', ['setup_user']);
    await pool.query('delete from steam_members where steam_id = $1', [steamId]);
    await pool.query(`delete from "user" where id = 'setup_user'`);
  };
  beforeAll(async () => {
    pool = await openTestDb(); setup = await import('./setup');
    await cleanup();
    await pool.query(`insert into "user" (id, name, email, "emailVerified") values ('setup_user', '준비', 'setup@test.invalid', false)`);
  });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('연결된 Steam 계정과 동의 여부, 저장 국가를 돌려준다', async () => {
    expect(await setup.steamSetupStatus('setup_user')).toMatchObject({ accounts: [], consented: false });
    await pool.query(`insert into steam_members (steam_id, persona_name, owner_id) values ($1, '내 Steam', 'setup_user')`, [steamId]);
    const { acceptSteamConsent, STEAM_FEATURE_NOTICE } = await import('./consent');
    await acceptSteamConsent('setup_user', STEAM_FEATURE_NOTICE);
    const status = await setup.steamSetupStatus('setup_user');
    expect(status).toEqual({ accounts: [{ steamId, name: '내 Steam' }], consented: true, storageCountry: expect.any(String) });
  });
});
