import type { ActiveGame, ChampionMastery, MatchHistory, MatchPlayer } from '../types';
import { championName } from './champions';
import type { LeagueEntryDto, MasteryDto, MatchDto, ParticipantDto, SpectatorDto } from './riotDto';

// Riot 응답 -> 앱 도메인 타입. 네트워크와 무관한 순수 함수라 입력/출력만으로 검증할 수 있다.

const itemsOf = (p: ParticipantDto) =>
  [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].filter(
    (id): id is number => id !== undefined && id !== null
  );
const csOf = (p: ParticipantDto) => (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);

// 솔로 랭크 항목(없으면 첫 항목)을 티어 정보로 바꾼다. 랭크 기록이 없으면 UNRANKED.
export function toRankSummary(entries: LeagueEntryDto[] | null) {
  const entry = entries?.find((e) => e.queueType === 'RANKED_SOLO_5x5') ?? entries?.[0];
  return {
    tier: entry ? entry.tier : 'UNRANKED',
    rank: entry ? entry.rank : '',
    leaguePoints: entry ? entry.leaguePoints : 0,
    wins: entry ? entry.wins : 0,
    losses: entry ? entry.losses : 0,
  };
}

export const toChampionMastery = (m: MasteryDto): ChampionMastery => ({
  championId: m.championId,
  championName: championName(m.championId, 'Ezreal'),
  championLevel: m.championLevel,
  championPoints: m.championPoints,
  lastPlayTime: m.lastPlayTime,
});

// 매치 상세 -> 기록. 참가자 정보가 없는 응답이면 null.
export function toMatchHistory(matchId: string, match: MatchDto, puuid: string): MatchHistory | null {
  const info = match.info;
  if (!info?.participants) return null;

  const me = info.participants.find((p) => p.puuid === puuid) || info.participants[0];

  const allPlayers: MatchPlayer[] = info.participants.map((p) => {
    let gameName = p.riotIdGameName || p.summonerName || '소환사';
    let tagLine = p.riotIdTagline || '';
    if (!tagLine && p.summonerName && p.summonerName.includes('#')) {
      const parts = p.summonerName.split('#');
      gameName = parts[0];
      tagLine = parts[1] || '';
    }
    return {
      gameName,
      tagLine,
      championName: p.championName || 'Unknown',
      championId: p.championId || 0,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      win: !!p.win,
      totalMinionsKilled: csOf(p),
      goldEarned: p.goldEarned || 0,
      itemIds: itemsOf(p),
    };
  });

  return {
    matchId,
    gameMode: info.gameMode || 'CLASSIC',
    gameDuration: info.gameDuration || 0,
    gameCreation: info.gameCreation || Date.now(),
    championName: me.championName || 'Unknown',
    kills: me.kills || 0,
    deaths: me.deaths || 0,
    assists: me.assists || 0,
    win: !!me.win,
    cs: csOf(me),
    gold: me.goldEarned || 0,
    items: itemsOf(me),
    allPlayers,
  };
}

export function toActiveGame(game: SpectatorDto, puuid: string): ActiveGame {
  const me = game.participants.find((p) => p.puuid === puuid);
  const myTeamId = me ? me.teamId : 100;
  const myChampionId = me ? me.championId : 0;

  return {
    gameId: game.gameId,
    gameLength: game.gameLength,
    gameStartTime: game.gameStartTime,
    championName: championName(myChampionId),
    mapId: game.mapId,
    gameMode: game.gameMode,
    teamPlayers: game.participants.map((p) => {
      let gameName = p.summonerName || 'Unknown';
      let tagLine = '';
      if (p.riotId) {
        const parts = p.riotId.split('#');
        gameName = parts[0];
        tagLine = parts[1] || '';
      }
      return { gameName, tagLine, championName: championName(p.championId), isAlly: p.teamId === myTeamId };
    }),
  };
}
