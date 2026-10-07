import { z } from 'zod';
import { getLibrary } from './client';
import { rankCandidates, unownedCandidates, type Candidate, type OwnershipScope, type Preference } from './recommend';
import { getDiscoveryGames } from './discovery';
import { registeredIds, steamIdSchema } from './roster';
import { getPlaySupport, type PlaySupport } from './store';

export const recommendationsQuerySchema = z.object({
  ids: z.string().transform(s => s.split(',')).pipe(z.array(steamIdSchema).max(20).transform(ids => [...new Set(ids)]).pipe(z.array(steamIdSchema).min(2))),
  preference: z.enum(['balanced', 'familiar', 'fresh']).default('balanced'),
  scope: z.enum(['all', 'any', 'unowned']).default('all'),
});
export interface Recommendation extends Omit<Candidate, 'ownerIndexes' | 'score'> { support: PlaySupport; score: number | null; missingIds: string[] }
export interface RecommendationsResult {
  games: Recommendation[];
  excluded: string[];
  totalCommon: number;
  totalCandidates: number;
  checked: number;
  unverified: number;
}

// 호출 수/지연을 제한한다. 모든 공통 게임을 추천했다고 표현하지 않도록 검사 범위를 함께 반환한다.
export const CANDIDATE_LIMIT = 40;
const RESULT_LIMIT = 12;
export async function recommendGames(ids: string[], preference: Preference, scope: OwnershipScope = 'all'): Promise<RecommendationsResult | { unknownIds: string[] }> {
  const unique = [...new Set(ids)];
  const known = new Set(await registeredIds(unique));
  const unknownIds = unique.filter(id => !known.has(id));
  if (unknownIds.length) return { unknownIds };
  const libraries = await Promise.all(unique.map(id => getLibrary(id)));
  const excluded = unique.filter((_, index) => !libraries[index].ok);
  // 한 사람이라도 확인할 수 없으면 '모두 보유'라고 추천할 수 없다.
  if (excluded.length) return { games: [], excluded, totalCommon: 0, totalCandidates: 0, checked: 0, unverified: 0 };
  const visible = libraries.flatMap(lib => lib.ok ? [lib.games] : []);
  const candidates = scope === 'unowned' ? unownedCandidates(visible, await getDiscoveryGames()) : rankCandidates(visible, preference, scope);
  const totalCommon = scope === 'all' ? candidates.length : rankCandidates(visible, preference).length;
  const shortlist = candidates.slice(0, CANDIDATE_LIMIT);
  const inspected: Recommendation[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, shortlist.length) }, async () => {
    while (cursor < shortlist.length) {
      const candidate = shortlist[cursor++];
      const { ownerIndexes, ...entry } = candidate;
      inspected.push({ ...entry, score: scope === 'unowned' ? null : entry.score,
        missingIds: unique.filter((_, index) => !ownerIndexes.includes(index)), support: await getPlaySupport(candidate.appId) });
    }
  }));
  // 미확인 후보는 검증된 추천에 섞지 않는다. 스토어 실패는 라이브러리 오류와 구분한다.
  const order = new Map(shortlist.map((candidate, index) => [candidate.appId, index]));
  const games = inspected.filter(game => game.support === 'coop' || game.support === 'multiplayer')
    .sort((a, b) => order.get(a.appId)! - order.get(b.appId)!).slice(0, RESULT_LIMIT);
  return { games, excluded: [], totalCommon, totalCandidates: candidates.length, checked: shortlist.length,
    unverified: inspected.filter(game => game.support === 'unknown').length };
}
