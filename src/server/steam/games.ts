import { z } from 'zod';
import { getLibrary } from './client';
import { type Entry, commonGames, unplayedByAll } from './compare';
import { registeredIds, steamIdSchema } from './roster';

export const gamesQuerySchema = z.object({
  ids: z.string().transform((s) => s.split(',')).pipe(z.array(steamIdSchema).min(1).max(20)),
  mode: z.enum(['common', 'unplayed']).default('common'),
});

export interface GamesResult {
  games: Entry[];
  // 게임 목록이 비공개라 비교에서 빠진 사람
  excluded: string[];
}

// ponytail: 요청마다 Steam을 다시 부른다(캐시 없음). 사람이 많아지거나 429가 나면 DB 캐시를 둔다.
export async function compareGames(ids: string[], mode: 'common' | 'unplayed'): Promise<GamesResult | { unknownIds: string[] }> {
  const unique = [...new Set(ids)];
  const known = new Set(await registeredIds(unique));
  const unknownIds = unique.filter((id) => !known.has(id));
  if (unknownIds.length) return { unknownIds };

  const libs = await Promise.all(unique.map(async (id) => [id, await getLibrary(id)] as const));
  const visible = libs.flatMap(([, l]) => (l.ok ? [l.games] : []));
  const excluded = libs.filter(([, l]) => !l.ok).map(([id]) => id);
  if (!visible.length) return { games: [], excluded };
  return { games: (mode === 'common' ? commonGames : unplayedByAll)(visible), excluded };
}

// 프로필용: 한 계정의 플레이 시간 상위 게임. 비공개이거나 Steam 호출이 실패하면 null(프로필 전체를 막지 않는다).
export async function topPlayed(steamId: string, limit = 5): Promise<{ name: string; minutes: number }[] | null> {
  try {
    const lib = await getLibrary(steamId);
    if (!lib.ok) return null;
    return [...lib.games].sort((a, b) => b.minutes - a.minutes).slice(0, limit).map((g) => ({ name: g.name, minutes: g.minutes }));
  } catch {
    return null;
  }
}
