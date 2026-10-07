import { z } from 'zod';
import { steamCacheGet, steamCachePut, steamStat } from './cache';
import { SteamPayloadError, SteamUpstreamError } from './client';

const gameSchema = z.object({ appId: z.number().int().positive(), name: z.string().min(1) });
const gamesSchema = z.array(gameSchema);
const sectionSchema = z.object({ items: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1) })) });
const featuredSchema = z.object({ status: z.literal(1), top_sellers: sectionSchema, new_releases: sectionSchema });
let pending: Promise<z.infer<typeof gamesSchema>> | undefined;

// 공개 스토어의 현재 인기·신규 후보만 사용한다. 전체 Steam 카탈로그나 개인화 추천으로 표현하지 않는다.
export async function getDiscoveryGames(): Promise<z.infer<typeof gamesSchema>> {
  if (pending) return pending;
  pending = (async () => {
    const key = 'store:discovery:kr:v1';
    const cached = gamesSchema.safeParse(await steamCacheGet(key));
    if (cached.success) { await steamStat('hit'); return cached.data; }
    await steamStat('miss');
    try {
      const res = await fetch('https://store.steampowered.com/api/featuredcategories?l=koreana&cc=kr', {
        signal: AbortSignal.timeout(5000), cache: 'no-store',
      });
      if (!res.ok) throw new SteamUpstreamError(res.status);
      const parsed = featuredSchema.safeParse(await res.json());
      if (!parsed.success) throw new SteamPayloadError();
      const games = [...new Map([...parsed.data.top_sellers.items, ...parsed.data.new_releases.items]
        .map(game => [game.id, { appId: game.id, name: game.name }])).values()];
      await steamCachePut(key, games, 900);
      return games;
    } catch (error) {
      await steamStat('error', 'store/featuredcategories', error instanceof SteamUpstreamError ? String(error.status) : 'network');
      // 목록 조회 실패는 정상적인 '후보 없음'으로 바꾸지 않는다.
      throw error instanceof SteamUpstreamError ? error : new SteamUpstreamError(502);
    }
  })();
  try { return await pending; } finally { pending = undefined; }
}
