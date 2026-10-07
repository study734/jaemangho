import type { OwnedGame, RecentGame } from './client';

export type Preference = 'balanced' | 'familiar' | 'fresh' | 'recent';
export type OwnershipScope = 'all' | 'any' | 'unowned';
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
  owners: number;
  ownerIndexes: number[];
}

// 점수는 성공 확률이 아니라 동일한 모임 안에서 후보를 비교하는 휴리스틱이다.
// 로그와 상한으로 한 사람의 수천 시간 플레이가 순위를 독점하지 않게 한다.
const experience = (minutes: number) => Math.min(1, Math.log1p(minutes) / Math.log1p(480));
const weights = {
  balanced: [0.4, 0.4, 0.2],
  familiar: [0.7, 0.2, 0.1],
  fresh: [0.1, 0.2, 0.7],
} satisfies Record<Exclude<Preference, 'recent'>, number[]>;

export function rankCandidates(libraries: OwnedGame[][], preference: Exclude<Preference, 'recent'>, scope: 'all' | 'any' = 'all'): Candidate[] {
  if (libraries.length < 2) return [];
  const maps = libraries.map(lib => new Map(lib.map(game => [game.appId, game])));
  const candidates: Candidate[] = [];
  const pool = scope === 'all' ? maps[0] : new Map(libraries.flatMap(lib => lib.map(game => [game.appId, game] as const)));
  for (const game of pool.values()) {
    const games = maps.map(map => map.get(game.appId));
    if (scope === 'all' && games.some(value => !value)) continue;
    const ownerIndexes = games.flatMap((value, index) => value ? [index] : []);
    // 미보유자의 경험은 알 수 없다. 보유자의 기록만 계산하고 보유 비율을 점수에 반영한다.
    const minutes = games.flatMap(value => value ? [Math.max(0, value.minutes)] : []);
    const playedBy = minutes.filter(value => value > 0).length;
    const beginnerCount = minutes.filter(value => value < 60).length;
    const experiences = minutes.map(experience);
    const familiarity = experiences.reduce((sum, value) => sum + value, 0) / minutes.length;
    const balance = 1 - (Math.max(...experiences) - Math.min(...experiences));
    const freshness = 1 - familiarity;
    const [familiarWeight, balanceWeight, freshWeight] = weights[preference];
    const score = Math.round(100 * (familiarity * familiarWeight + balance * balanceWeight + freshness * freshWeight) * minutes.length / libraries.length);
    const allOwn = minutes.length === libraries.length;
    const reasons = [allOwn ? `선택한 ${minutes.length}명 모두 보유` : `선택한 ${libraries.length}명 중 ${minutes.length}명 보유`];
    if (playedBy === 0) reasons.push(allOwn ? '모두 아직 플레이하지 않은 게임' : '보유자 모두 아직 플레이 기록이 없어요');
    else if (playedBy === minutes.length) reasons.push(allOwn ? '모두 플레이 경험이 있어요' : '보유자 모두 플레이 경험이 있어요');
    else reasons.push(`${allOwn ? '' : '보유자 중 '}${playedBy}명은 경험이 있고 ${minutes.length - playedBy}명은 처음이에요`);
    if (beginnerCount > 0 && playedBy > 0) reasons.push(`플레이 1시간 미만 ${beginnerCount}명`);
    if (balance >= 0.8 && playedBy > 0 && minutes.length > 1) reasons.push('플레이 경험 차이가 작은 편이에요');
    candidates.push({ appId: game.appId, name: game.name, totalMinutes: minutes.reduce((a, b) => a + b, 0), playedBy, beginnerCount,
      minMinutes: Math.min(...minutes), maxMinutes: Math.max(...minutes), score, reasons, owners: minutes.length, ownerIndexes });
  }
  return candidates.sort((a, b) => b.score - a.score || a.appId - b.appId);
}

export interface RecentCandidate extends Candidate { recentPlayers: number; recentMinutes: number }
export function rankRecentCandidates(libraries: OwnedGame[][], recent: (RecentGame[] | null)[], scope: 'all' | 'any'): RecentCandidate[] {
  const maps = recent.map(games => games === null ? null : new Map(games.map(game => [game.appId, game.minutes])));
  return rankCandidates(libraries, 'balanced', scope).map(candidate => {
    const minutes = candidate.ownerIndexes.map(index => Math.max(0, maps[index]?.get(candidate.appId) ?? 0));
    const recentPlayers = minutes.filter(value => value > 0).length;
    const recentMinutes = minutes.reduce((sum, value) => sum + value, 0);
    const activity = Math.min(1, Math.log1p(recentMinutes) / Math.log1p(840));
    return { ...candidate, recentPlayers, recentMinutes,
      score: Math.round(100 * (0.7 * recentPlayers / libraries.length + 0.3 * activity * candidate.owners / libraries.length)),
      reasons: [...candidate.reasons, `최근 2주 ${recentPlayers}명 플레이`],
    };
  }).filter(candidate => candidate.recentPlayers > 0)
    .sort((a, b) => b.score - a.score || b.recentMinutes - a.recentMinutes || a.appId - b.appId);
}

// 인기·신규 목록의 순서를 보존한다. 보유/플레이 기록이 없는 후보에 취향 점수를 지어내지 않는다.
export function unownedCandidates(libraries: OwnedGame[][], catalog: Pick<OwnedGame, 'appId' | 'name'>[]): Candidate[] {
  if (libraries.length < 2) return [];
  const owned = new Set(libraries.flatMap(lib => lib.map(game => game.appId)));
  return [...new Map(catalog.map(game => [game.appId, game])).values()].filter(game => !owned.has(game.appId)).map(game => ({
    ...game, totalMinutes: 0, playedBy: 0, beginnerCount: 0, minMinutes: 0, maxMinutes: 0,
    owners: 0, ownerIndexes: [], score: 0, reasons: [`선택한 ${libraries.length}명 모두 보유 목록에 없음`, 'Steam 인기·신규 목록에서 발견한 게임'],
  }));
}
