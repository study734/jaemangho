import { pool } from '../pool';

export interface RiotMatchFact {
  matchId: string;
  playedAt: Date;
  durationSeconds: number;
  queueId: number | null;
  gameMode: string;
  observedAt: Date;
  participants: {
    puuid: string;
    teamId: number;
    championId: number;
    win: boolean;
    kills: number;
    deaths: number;
    assists: number;
  }[];
}

// 수집 경로가 승인된 뒤 호출한다. 등록된 PUUID의 최소 사실만 남긴다.
export async function recordRiotMatchFact(fact: RiotMatchFact): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const identities = (await client.query<{ member_id: string; puuid: string }>(
      'select member_id, puuid from riot_account_identity where puuid = any($1)',
      [fact.participants.map((p) => p.puuid)],
    )).rows;
    if (identities.length === 0) {
      await client.query('commit');
      return 0;
    }

    await client.query(`insert into riot_matches
      (match_id, played_at, duration_seconds, queue_id, game_mode, observed_at)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (match_id) do nothing`,
    [fact.matchId, fact.playedAt, fact.durationSeconds, fact.queueId, fact.gameMode, fact.observedAt]);

    const memberByPuuid = new Map(identities.map((row) => [row.puuid, row.member_id]));
    for (const participant of fact.participants) {
      const memberId = memberByPuuid.get(participant.puuid);
      if (!memberId) continue;
      await client.query(`insert into riot_match_participants
        (match_id, member_id, puuid, team_id, champion_id, win, kills, deaths, assists)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (match_id, member_id) do nothing`,
      [fact.matchId, memberId, participant.puuid, participant.teamId, participant.championId,
        participant.win, participant.kills, participant.deaths, participant.assists]);
    }
    await client.query('commit');
    return identities.length;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
