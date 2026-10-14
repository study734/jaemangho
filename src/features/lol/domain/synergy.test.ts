import { expect, it } from 'vitest';
import { duoSynergy } from './synergy';
import { toMember } from '../api/roster';
import type { MatchHistory, MatchPlayer, Member } from '../types';

const player = (gameName: string, tagLine = 'KR1', win = true): MatchPlayer => ({
  gameName, tagLine, win, kills: 3, deaths: 2, assists: 5,
  championName: 'Ahri', championId: 103, totalMinionsKilled: 10, goldEarned: 100, itemIds: [],
});
const match = (matchId: string, allPlayers: MatchPlayer[]): MatchHistory => ({
  matchId, allPlayers, gameMode: 'CLASSIC', gameDuration: 100, gameCreation: 1,
  championName: 'Ahri', kills: 3, deaths: 2, assists: 5, win: true, cs: 10, gold: 100, items: [],
});
const member = (gameName: string, matches: MatchHistory[], tagLine = 'KR1'): Member => ({
  ...toMember({ id: `${gameName}_${tagLine}`, gameName, tagLine }), matches,
});

it('KR_ 경기 ID를 분해하지 않으며 같은 경기가 두 사람의 기록에 있어도 한 번만 센다', () => {
  const game = match('KR_123456', [player('A'), player('B')]);
  expect(duoSynergy([member('A', [game]), member('B', [game])])).toEqual([
    { duoName: 'A#KR1 & B#KR1', gamesPlayed: 1, wins: 1, losses: 0, winRate: 100, avgKda: '4.00' },
  ]);
});

it('여러 경기와 세 사람의 서로 다른 듀오를 독립적으로 집계한다', () => {
  const first = match('KR_1', [player('A'), player('B'), player('C')]);
  const second = match('KR_2', [player('A', 'KR1', false), player('B', 'KR1', false)]);
  const stats = duoSynergy([member('A', [first, second]), member('B', [first, second]), member('C', [first])]);
  expect(stats).toHaveLength(3);
  expect(stats[0]).toMatchObject({ duoName: 'A#KR1 & B#KR1', gamesPlayed: 2, wins: 1, losses: 1, winRate: 50 });
});

it('같은 이름의 다른 태그와 구분 문자가 포함된 이름을 서로 섞지 않는다', () => {
  const game = match('KR_1_more', [player('같은_이름', 'KR1'), player('같은_이름', 'KR2'), player('A & B')]);
  const stats = duoSynergy([member('같은_이름', [game], 'KR1'), member('같은_이름', [game], 'KR2'), member('A & B', [game])]);
  expect(stats).toHaveLength(3);
  expect(new Set(stats.map(pair => pair.duoName)).size).toBe(3);
  expect(stats.every(pair => pair.gamesPlayed === 1)).toBe(true);
});

it('다른 팀, 미등록 플레이어와 본인이 없는 경기는 제외한다', () => {
  const game = match('KR_1', [player('A'), player('B', 'KR1', false), player('outsider')]);
  expect(duoSynergy([member('A', [game]), member('B', [game]), member('C', [game])])).toEqual([]);
});
