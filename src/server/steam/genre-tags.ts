import { z } from 'zod';
import type { TasteTag } from '../../domain/steam-personal';
import { recommendationCatalog } from './catalog';
import { steamCacheGet, steamCachePut, steamStat } from './cache';

const cacheSchema = z.array(z.enum(['action', 'adventure', 'strategy', 'rpg', 'simulation', 'casual']));
const responseSchema = z.object({ success: z.literal(true), data: z.object({ type: z.literal('game'), steam_appid: z.number(),
  genres: z.array(z.object({ id: z.string() })).optional(),
}) });
const genreMap: Record<string, TasteTag> = { '1': 'action', '2': 'strategy', '3': 'rpg', '4': 'casual', '25': 'adventure', '28': 'simulation' };
const pending = new Map<number, Promise<TasteTag[] | null>>();
// Only a bounded shortlist of played games uses this lookup. Detailed mechanics
// are source-checked editorial tags; store genres are a coarser fallback.
export async function genreTags(appId: number): Promise<TasteTag[] | null> {
  const known = recommendationCatalog.find(game => game.appId === appId);
  if (known) return known.tags;
  const existing = pending.get(appId);
  if (existing) return existing;
  const work = (async () => {
    const key = `store:taste-genres:v1:${appId}`;
    const cached = cacheSchema.safeParse(await steamCacheGet(key));
    if (cached.success) { await steamStat('hit'); return cached.data; }
    await steamStat('miss');
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,genres&l=english`, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (!response.ok) throw new Error('store_http');
      const body = z.record(z.string(), z.unknown()).parse(await response.json());
      const parsed = responseSchema.parse(body[String(appId)]);
      if (parsed.data.steam_appid !== appId) throw new Error('wrong_app');
      const tags = [...new Set((parsed.data.genres ?? []).flatMap(genre => genreMap[genre.id] ? [genreMap[genre.id]] : []))];
      await steamCachePut(key, tags, 86400);
      return tags;
    } catch {
      await steamStat('error', `store/taste-genres/${appId}`, 'unavailable');
      return null;
    }
  })();
  pending.set(appId, work);
  try { return await work; } finally { pending.delete(appId); }
}
