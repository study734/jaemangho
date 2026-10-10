import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

vi.mock('./steam-policy', () => ({ STEAM_STORAGE_COUNTRY: 'Test country', STEAM_NOTICE_VERSION: 'test-v1' }));
const STEAM_ID = '76561193000000012';

describe.skipIf(!testDbUrl)('Steam 수집 요청·중단·삭제 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let consent: typeof import('./steam-consent');
  let recordSteamObservation: typeof import('./steam-facts').recordSteamObservation;

  beforeAll(async () => {
    pool = await openTestDb();
    consent = await import('./steam-consent');
    ({ recordSteamObservation } = await import('./steam-facts'));
    await pool.query(`insert into "user" (id, name, email, "emailVerified") values
      ('tco_owner', '소유자', 'tco1@test.invalid', false),
      ('tco_other', '다른사람', 'tco2@test.invalid', false)`);
    await pool.query(`insert into steam_members (steam_id, persona_name, owner_id) values ($1, '테스트', 'tco_owner')`, [STEAM_ID]);
    await pool.query(`insert into steam_verified_accounts (steam_id, user_id) values ($1, 'tco_owner')`, [STEAM_ID]);
  });
  afterAll(async () => {
    await pool.query(`delete from steam_members where steam_id = $1`, [STEAM_ID]);
    await pool.query(`delete from "user" where id in ('tco_owner', 'tco_other')`);
    await pool.end();
  });

  it('확인된 본인만 요청하고, 중단 뒤에는 저장을 막으며, 삭제 시 기준값과 연결을 제거한다', async () => {
    expect(await consent.requestSteamActivity('tco_other', STEAM_ID, 'test-v1')).toBe(false);
    await expect(consent.requestSteamActivity('tco_owner', STEAM_ID, 'wrong')).rejects.toThrow();
    expect(await consent.requestSteamActivity('tco_owner', STEAM_ID, 'test-v1')).toBe(true);
    expect((await pool.query(`select storage_country from steam_collection_requests where steam_id = $1`, [STEAM_ID])).rows[0].storage_country).toBe('Test country');
    const first = new Date('2040-04-01T00:00:00Z');
    await recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 100 }], first);
    await recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 120 }], new Date('2040-04-08T00:00:00Z'));
    expect(await consent.stopSteamActivity('tco_other', STEAM_ID)).toBe(false);
    expect(await consent.stopSteamActivity('tco_owner', STEAM_ID)).toBe(true);
    await expect(recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 140 }], new Date('2040-04-15T00:00:00Z'))).rejects.toThrow();
    expect(await consent.eraseSteamActivity('tco_other', STEAM_ID)).toBe(false);
    expect(await consent.eraseSteamActivity('tco_owner', STEAM_ID)).toBe(true);
    for (const table of ['steam_collection_requests', 'steam_game_totals', 'steam_playtime_changes', 'steam_verified_accounts']) {
      expect((await pool.query(`select count(*)::int as n from ${table} where steam_id = $1`, [STEAM_ID])).rows[0].n).toBe(0);
    }
    expect(await consent.requestSteamActivity('tco_owner', STEAM_ID, 'test-v1')).toBe(false);
    expect((await consent.getSteamActivitySettings('tco_owner')).accounts).toEqual([]);
  });

  it('외부 조회 중 기록을 삭제하면 늦은 응답이 수집 상태를 되살리지 않는다', async () => {
    await pool.query(`insert into steam_verified_accounts (steam_id, user_id) values ($1, 'tco_owner')`, [STEAM_ID]);
    expect(await consent.requestSteamActivity('tco_owner', STEAM_ID, 'test-v1')).toBe(true);
    const { runSteamCollection } = await import('./steam-collection');
    let notify!: () => void;
    const fetching = new Promise<void>((resolve) => { notify = resolve; });
    let release!: (value: { ok: false }) => void;
    const response = new Promise<{ ok: false }>((resolve) => { release = resolve; });
    const job = runSteamCollection('manual', { fetchLibrary: async () => { notify(); return response; } });
    await fetching;
    expect(await consent.eraseSteamActivity('tco_owner', STEAM_ID)).toBe(true);
    release({ ok: false });
    await job;
    expect((await pool.query(`select count(*)::int as n from steam_collection_state where steam_id = $1`, [STEAM_ID])).rows[0].n).toBe(0);
  });
});
