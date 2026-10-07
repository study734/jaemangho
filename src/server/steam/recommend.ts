import type { OwnedGame } from './client';

export type Preference = 'balanced' | 'familiar' | 'fresh';
export interface Candidate {
  appId: number;
  name: string;
  totalMinutes: number;
  playedBy: number;
  beginnerCount: number;
  minMinutes: number;
  maxMinutes: number;
  score: number;
  reasons: string[];
}

// 점수는 성공 확률이 아니라 동일한 모임 안에서 후보를 비교하는 휴리스틱이다.
// 로그와 상한으로 한 사람의 수천 시간 플레이가 순위를 독점하지 않게 한다.
const experience = (minutes: number) => Math.min(1, Math.log1p(minutes) / Math.log1p(480));
const weights = {
  balanced: [0.4, 0.4, 0.2],
  familiar: [0.7, 0.2, 0.1],
  fresh: [0.1, 0.2, 0.7],
} satisfies Record<Preference, number[]>;

export function rankCandidates(libraries: OwnedGame[][], preference: Preference): Candidate[] {
  if (libraries.length < 2) return [];
  const maps = libraries.map(lib => new Map(lib.map(game => [game.appId, game])));
  const candidates: Candidate[] = [];
  for (const game of maps[0].values()) {
    const games = maps.map(map => map.get(game.appId));
    if (games.some(value => !value)) continue;
    const minutes = games.map(value => Math.max(0, value!.minutes));
    const playedBy = minutes.filter(value => value > 0).length;
    const beginnerCount = minutes.filter(value => value < 60).length;
    const experiences = minutes.map(experience);
    const familiarity = experiences.reduce((sum, value) => sum + value, 0) / minutes.length;
    const balance = 1 - (Math.max(...experiences) - Math.min(...experiences));
    const freshness = 1 - familiarity;
    const [familiarWeight, balanceWeight, freshWeight] = weights[preference];
    const score = Math.round(100 * (familiarity * familiarWeight + balance * balanceWeight + freshness * freshWeight));
    const reasons = [`선택한 ${minutes.length}명 모두 보유`];
    if (playedBy === 0) reasons.push('모두 아직 플레이하지 않은 게임');
    else if (playedBy === minutes.length) reasons.push('모두 플레이 경험이 있어요');
    else reasons.push(`${playedBy}명은 경험이 있고 ${minutes.length - playedBy}명은 처음이에요`);
    if (beginnerCount > 0 && playedBy > 0) reasons.push(`플레이 1시간 미만 ${beginnerCount}명`);
    if (balance >= 0.8 && playedBy > 0) reasons.push('플레이 경험 차이가 작은 편이에요');
    candidates.push({ appId: game.appId, name: game.name, totalMinutes: minutes.reduce((a, b) => a + b, 0), playedBy, beginnerCount,
      minMinutes: Math.min(...minutes), maxMinutes: Math.max(...minutes), score, reasons });
  }
  return candidates.sort((a, b) => b.score - a.score || a.appId - b.appId);
}
