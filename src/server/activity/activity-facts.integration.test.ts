import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const STEAM_ID = '76561193000000001';

describe.skipIf(!testDbUrl)('Riot·Steam 활동 사실 저장 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let recordRiotMatchFact: typeof import('./riot-facts').recordRiotMatchFact;
  let recordSteamObservation: typeof import('./steam-facts').recordSteamObservation;

  beforeAll(async () => {
    pool = await openTestDb();
    ({ recordRiotMatchFact } = await import('./riot-facts'));
    ({ recordSteamObservation } = await import('./steam-facts'));
    await pool.query(`insert into "user" (id, name, email, "emailVerified")
      values ('taf_user', '활동테스트', 'taf@test.invalid', false)`);
    await pool.query(`insert into members (id, game_name, tag_line) values
      ('taf_riot_1', 'FactOne', 'T1'), ('taf_riot_2', 'FactTwo', 'T2')`);
    await pool.query(`insert into riot_account_identity (member_id, puuid, verified_at) values
      ('taf_riot_1', 'taf_puuid_1', now()), ('taf_riot_2', 'taf_puuid_2', now())`);
    await pool.query(`insert into steam_members (steam_id, persona_name, owner_id) values ($1, '활동테스트', 'taf_user')`, [STEAM_ID]);
  });
  afterAll(async () => {
    await pool.query(`delete from members where id like 'taf_riot_%'`);
    await pool.query(`delete from riot_matches where match_id = 'taf_match'`);
    await pool.query(`delete from steam_members where steam_id = $1`, [STEAM_ID]);
    await pool.query(`delete from "user" where id = 'taf_user'`);
    await pool.end();
  });

  it('등록된 PUUID만 경기별로 저장하고 재처리는 중복하지 않는다', async () => {
    const fact = {
      matchId: 'taf_match', playedAt: new Date('2040-01-01T10:00:00Z'),
      durationSeconds: 1800, queueId: 420, gameMode: 'CLASSIC', observedAt: new Date('2040-01-02T00:00:00Z'),
      participants: [
        { puuid: 'taf_puuid_1', teamId: 100, championId: 1, win: true, kills: 2, deaths: 3, assists: 4 },
        { puuid: 'taf_puuid_2', teamId: 100, championId: 2, win: true, kills: 5, deaths: 6, assists: 7 },
        { puuid: 'taf_unregistered', teamId: 200, championId: 3, win: false, kills: 8, deaths: 9, assists: 0 },
      ],
    };
    expect(await recordRiotMatchFact(fact)).toBe(2);
    expect(await recordRiotMatchFact(fact)).toBe(2);
    const participants = (await pool.query(`select member_id, team_id from riot_match_participants
      where match_id = 'taf_match' order by member_id`)).rows;
    expect(participants).toEqual([
      { member_id: 'taf_riot_1', team_id: 100 },
      { member_id: 'taf_riot_2', team_id: 100 },
    ]);
    expect((await pool.query(`select count(*)::int as n from riot_matches where match_id = 'taf_match'`)).rows[0].n).toBe(1);
  });

  it('Steam 요청 전 저장을 거부하고 기준선·증가·재실행·감소를 구분한다', async () => {
    const first = new Date('2040-02-01T00:00:00Z');
    const second = new Date('2040-02-08T00:00:00Z');
    const third = new Date('2040-02-15T00:00:00Z');
    await expect(recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 100 }], first)).rejects.toThrow('not requested');
    await pool.query(`insert into steam_collection_requests
      (steam_id, requested_by, notice_version, requested_at) values ($1, 'taf_user', 'test-v1', now())`, [STEAM_ID]);
    expect(await recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 100 }], first)).toBe(0);
    expect(await recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 140 }], second)).toBe(1);
    expect(await recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 140 }], second)).toBe(0);
    expect(await recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 120 }], third)).toBe(0);
    expect((await pool.query(`select previous_minutes::int, minutes::int from steam_playtime_changes
      where steam_id = $1 order by observed_at`, [STEAM_ID])).rows).toEqual([
      { previous_minutes: 100, minutes: 140 },
    ]);
    expect((await pool.query(`select minutes::int from steam_game_totals where steam_id = $1`, [STEAM_ID])).rows[0].minutes).toBe(120);
    await pool.query(`update steam_collection_requests set stopped_at = now() where steam_id = $1`, [STEAM_ID]);
    await expect(recordSteamObservation(STEAM_ID, [{ appId: 10, minutes: 150 }], new Date('2040-02-22T00:00:00Z'))).rejects.toThrow('not requested');
  });
});
