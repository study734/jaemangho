import { describe, expect, it } from 'vitest';
import { toActiveGame, toChampionMastery, toMatchHistory, toRankSummary } from './mappers';
import type { LeagueEntryDto, MatchDto, SpectatorDto } from './riotDto';

describe('toRankSummary', () => {
  const solo: LeagueEntryDto = { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 55, wins: 10, losses: 8 };
  const flex: LeagueEntryDto = { queueType: 'RANKED_FLEX_SR', tier: 'SILVER', rank: 'I', leaguePoints: 10, wins: 1, losses: 1 };

  it('솔로 랭크를 우선한다', () => {
    expect(toRankSummary([flex, solo])).toEqual({ tier: 'GOLD', rank: 'II', leaguePoints: 55, wins: 10, losses: 8 });
  });
  it('솔로가 없으면 첫 항목을 쓴다', () => {
    expect(toRankSummary([flex]).tier).toBe('SILVER');
  });
  it('기록이 없으면 UNRANKED', () => {
    expect(toRankSummary([])).toEqual({ tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 });
    expect(toRankSummary(null).tier).toBe('UNRANKED');
  });
});

describe('toChampionMastery', () => {
  it('알려진 ID는 이름으로, 모르는 ID는 Ezreal로 대체한다 (기존 동작 유지)', () => {
    const base = { championLevel: 7, championPoints: 100, lastPlayTime: 1 };
    expect(toChampionMastery({ championId: 103, ...base }).championName).toBe('Ahri');
    expect(toChampionMastery({ championId: 999999, ...base }).championName).toBe('Ezreal');
  });
});

describe('toMatchHistory', () => {
  const match: MatchDto = {
    info: {
      gameMode: 'ARAM',
      gameDuration: 900,
      gameCreation: 1700000000000,
      participants: [
        { puuid: 'other', riotIdGameName: '상대', riotIdTagline: 'KR1', championName: 'Jinx', kills: 1 },
        {
          puuid: 'me', summonerName: '나#KR2', championName: 'Ahri', championId: 103,
          kills: 5, deaths: 2, assists: 7, win: true,
          totalMinionsKilled: 100, neutralMinionsKilled: 20, goldEarned: 9000,
          item0: 3020, item1: 3100, item6: 3340,
        },
      ],
    },
  };

  it('puuid로 본인 참가자를 찾아 요약한다', () => {
    const h = toMatchHistory('KR_1', match, 'me')!;
    expect(h).toMatchObject({ matchId: 'KR_1', gameMode: 'ARAM', championName: 'Ahri', kills: 5, deaths: 2, assists: 7, win: true, cs: 120, gold: 9000 });
    expect(h.items).toEqual([3020, 3100, 3340]);
  });
  it('모든 참가자의 이름/태그를 해석한다 (riotId 필드 또는 summonerName#tag)', () => {
    const { allPlayers } = toMatchHistory('KR_1', match, 'me')!;
    expect(allPlayers[0]).toMatchObject({ gameName: '상대', tagLine: 'KR1' });
    expect(allPlayers[1]).toMatchObject({ gameName: '나', tagLine: 'KR2', totalMinionsKilled: 120 });
  });
  it('puuid가 없으면 첫 참가자를 본인으로 본다', () => {
    expect(toMatchHistory('KR_1', match, 'nobody')!.championName).toBe('Jinx');
  });
  it('참가자 정보가 없는 응답은 null', () => {
    expect(toMatchHistory('KR_1', {}, 'me')).toBeNull();
    expect(toMatchHistory('KR_1', { info: {} }, 'me')).toBeNull();
  });
});

describe('toActiveGame', () => {
  const game: SpectatorDto = {
    gameId: 1, gameLength: 120, gameStartTime: 1700000000000, mapId: 11, gameMode: 'CLASSIC',
    participants: [
      { puuid: 'me', teamId: 100, championId: 103, riotId: '나#KR1' },
      { puuid: 'ally', teamId: 100, championId: 222, summonerName: '아군' },
      { puuid: 'enemy', teamId: 200, championId: 999999, riotId: '적#KR9' },
    ],
  };

  it('본인 챔피언과 팀 구성을 만든다', () => {
    const g = toActiveGame(game, 'me');
    expect(g).toMatchObject({ gameId: 1, championName: 'Ahri', mapId: 11 });
    expect(g.teamPlayers).toEqual([
      { gameName: '나', tagLine: 'KR1', championName: 'Ahri', isAlly: true },
      { gameName: '아군', tagLine: '', championName: 'Jinx', isAlly: true },
      { gameName: '적', tagLine: 'KR9', championName: 'Unknown', isAlly: false },
    ]);
  });
});
