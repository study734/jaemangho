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
class GenreError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
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
      if (!response.ok) throw new GenreError(`http_${response.status}`);
      let body: unknown;
      try { body = await response.json(); } catch { throw new GenreError('invalid_response'); }
      const record = z.record(z.string(), z.unknown()).safeParse(body);
      const entry = record.success ? record.data[String(appId)] : undefined;
      // 스토어에서 내려갔거나(success:false) 게임이 아닌 앱(DLC·도구 등)은 오류가 아니다. 개선 우선순위 집계에서도 빠진다.
      if (entry && typeof entry === 'object' && 'success' in entry && entry.success === false) throw new GenreError('app_unavailable');
      if (entry && typeof entry === 'object' && 'data' in entry && (entry.data as { type?: unknown } | null)?.type !== 'game') throw new GenreError('app_unavailable');
      const parsed = responseSchema.safeParse(entry);
      if (!parsed.success || parsed.data.data.steam_appid !== appId) throw new GenreError('invalid_response');
      const tags = [...new Set((parsed.data.data.genres ?? []).flatMap(genre => genreMap[genre.id] ? [genreMap[genre.id]] : []))];
      await steamCachePut(key, tags, 86400);
      return tags;
    } catch (error) {
      // store.ts와 같은 분류: http_<상태>·invalid_response·app_unavailable·timeout·network. 원문 메시지는 남기지 않는다.
      const code = error instanceof GenreError ? error.code : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network';
      await steamStat('error', `store/taste-genres/${appId}`, code);
      return null;
    }
  })();
  pending.set(appId, work);
  try { return await work; } finally { pending.delete(appId); }
}
