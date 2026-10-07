import { z } from 'zod';
import { getAchievementDefinitions, getAchievementProgress, getLibrary } from './client';
import { buildMissionIdeas, type Mission } from './mission-ideas';
import { recommendationsQuerySchema } from './recommendations';
import { registeredIds } from './roster';

export const missionsQuerySchema = recommendationsQuerySchema.pick({ ids: true }).extend({ appId: z.coerce.number().int().positive().max(4294967295) });
export interface MissionsResult {
  state: 'ok' | 'unsupported' | 'unavailable' | 'not-owned' | 'complete';
  missions: Mission[];
  totalPublic: number;
  completedTogether: number;
  unknownAchievements: number;
  unavailableIds: string[];
  missingIds: string[];
}
const empty = (state: MissionsResult['state']): MissionsResult => ({ state, missions: [], totalPublic: 0,
  completedTogether: 0, unknownAchievements: 0, unavailableIds: [], missingIds: [] });

export async function findMissions(ids: string[], appId: number): Promise<MissionsResult | { unknownIds: string[] }> {
  const unique = [...new Set(ids)];
  const registered = new Set(await registeredIds(unique));
  const unknownIds = unique.filter(id => !registered.has(id));
  if (unknownIds.length) return { unknownIds };
  const libraries = await Promise.all(unique.map(id => getLibrary(id)));
  const unavailableIds = unique.filter((_, index) => !libraries[index].ok);
  if (unavailableIds.length) return { ...empty('unavailable'), unavailableIds };
  const missingIds = unique.filter((_, index) => {
    const library = libraries[index];
    return library.ok && !library.games.some(game => game.appId === appId);
  });
  if (missingIds.length) return { ...empty('not-owned'), missingIds };
  const definitions = await getAchievementDefinitions(appId);
  if (!definitions.some(definition => !definition.hidden)) return empty('unsupported');
  // 선택한 한 게임만 조회하며, 진행도 요청은 최대 4개를 병렬로 처리한다.
  const progress = new Map<string, Awaited<ReturnType<typeof getAchievementProgress>>>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
    while (cursor < unique.length) {
      const id = unique[cursor++];
      try { progress.set(id, await getAchievementProgress(id, appId)); }
      catch { progress.set(id, { ok: false }); }
    }
  }));
  const failed = unique.filter(id => !progress.get(id)?.ok);
  if (failed.length) return { ...empty('unavailable'), unavailableIds: failed };
  const result = buildMissionIdeas(definitions, unique.flatMap(steamId => {
    const player = progress.get(steamId);
    return player?.ok ? [{ steamId, achievements: player.achievements }] : [];
  }));
  const state = result.missions.length ? 'ok' : result.unknownAchievements ? 'unavailable' : 'complete';
  return { ...result, state, unavailableIds: [], missingIds: [] };
}
