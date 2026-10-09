import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const STEAM_ID = '76561193000000002';
const RATE_LIMIT_IDS = ['76561193000000003', '76561193000000004'];

describe.skipIf(!testDbUrl)('Steam 요청 계정 수집 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let runSteamCollection: typeof import('./steam-collection').runSteamCollection;

  beforeAll(async () => {
    pool = await openTestDb();
    ({ runSteamCollection } = await import('./steam-collection'));
    await pool.query(`delete from ops_jobs where job = 'steam_activity'`);
    await pool.query(`insert into "user" (id, name, email, "emailVerified")
      values ('tsc_user', '수집테스트', 'tsc@test.invalid', false)`);
    await pool.query(`insert into steam_members (steam_id, persona_name, owner_id)
      values ($1, '수집테스트', 'tsc_user')`, [STEAM_ID]);
  });
  afterAll(async () => {
    await pool.query(`delete from steam_members where steam_id = any($1)`, [[STEAM_ID, ...RATE_LIMIT_IDS]]);
    await pool.query(`delete from "user" where id = 'tsc_user'`);
    await pool.query(`delete from ops_jobs where job = 'steam_activity'`);
    await pool.end();
  });

  it('주인의 요청만 처리하고, 주간 간격·조회 불가·재개를 구분한다', async () => {
    const fetchLibrary = vi.fn().mockResolvedValue({ ok: true, games: [{ appId: 10, minutes: 100 }] });
    const first = new Date('2040-01-01T00:00:00Z');
    expect((await runSteamCollection('manual', { now: first, fetchLibrary })).collected).toBe(0);
    expect(fetchLibrary).not.toHaveBeenCalled();

    await pool.query(`insert into steam_collection_requests
      (steam_id, requested_by, notice_version, requested_at) values ($1, 'tsc_user', 'test-v1', $2)`, [STEAM_ID, first]);
    expect((await runSteamCollection('manual', { now: first, fetchLibrary })).collected).toBe(1);
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
    expect((await runSteamCollection('manual', { now: new Date('2040-01-02T00:00:00Z'), fetchLibrary })).collected).toBe(0);
    expect(fetchLibrary).toHaveBeenCalledTimes(1);

    fetchLibrary.mockResolvedValueOnce({ ok: false });
    const unavailable = await runSteamCollection('manual', { now: new Date('2040-01-08T00:00:00Z'), fetchLibrary });
    expect(unavailable.status).toBe('partial');
    expect(unavailable.unavailable).toBe(1);
    expect((await pool.query(`select minutes::int from steam_game_totals where steam_id = $1`, [STEAM_ID])).rows[0].minutes).toBe(100);

    fetchLibrary.mockResolvedValueOnce({ ok: true, games: [{ appId: 10, minutes: 130 }] });
    const resumed = await runSteamCollection('manual', { now: new Date('2040-01-09T00:00:00Z'), fetchLibrary });
    expect(resumed.changes).toBe(1);
    expect((await pool.query(`select last_result from steam_collection_state where steam_id = $1`, [STEAM_ID])).rows[0].last_result).toBe('success');
    expect((await pool.query(`select count(*)::int as n from steam_playtime_changes where steam_id = $1`, [STEAM_ID])).rows[0].n).toBe(1);

    await pool.query(`update steam_members set owner_id = null where steam_id = $1`, [STEAM_ID]);
    expect((await runSteamCollection('manual', { now: new Date('2040-01-17T00:00:00Z'), fetchLibrary })).collected).toBe(0);
    expect(fetchLibrary).toHaveBeenCalledTimes(3);
  });

  it('Steam 429를 받으면 남은 계정 호출을 멈추고 다음 실행에 넘긴다', async () => {
    const { SteamUpstreamError } = await import('../steam/client');
    for (const steamId of RATE_LIMIT_IDS) {
      await pool.query(`insert into steam_members (steam_id, persona_name, owner_id)
        values ($1, '호출제한테스트', 'tsc_user')`, [steamId]);
      await pool.query(`insert into steam_collection_requests
        (steam_id, requested_by, notice_version, requested_at)
        values ($1, 'tsc_user', 'test-v1', '2040-02-01T00:00:00Z')`, [steamId]);
    }
    const fetchLibrary = vi.fn().mockRejectedValue(new SteamUpstreamError(429));
    const result = await runSteamCollection('manual', { now: new Date('2040-02-01T00:00:00Z'), fetchLibrary });
    expect(result.status).toBe('partial');
    expect(result.failed).toBe(1);
    expect(result.deferred).toBe(1);
    expect(fetchLibrary).toHaveBeenCalledTimes(1);
    expect((await pool.query(`select last_error_code from steam_collection_state where steam_id = $1`, [RATE_LIMIT_IDS[0]])).rows[0].last_error_code).toBe('upstream_429');
  });
});
