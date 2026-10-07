import { z } from 'zod';
import { steamCacheGet, steamCachePut, steamStat } from './cache';

export type PlaySupport = 'coop' | 'multiplayer' | 'local' | 'single' | 'unknown';
const supportSchema = z.enum(['coop', 'multiplayer', 'local', 'single']);
const responseSchema = z.object({ success: z.literal(true), data: z.object({
  type: z.string(), steam_appid: z.number().int(), categories: z.array(z.object({ id: z.number().int() })),
}) });
const pending = new Map<number, Promise<PlaySupport>>();

export function supportFromCategories(ids: number[]): Exclude<PlaySupport, 'unknown'> {
  const has = (id: number) => ids.includes(id);
  if (has(38)) return 'coop'; // 온라인 협동
  if (has(36)) return 'multiplayer'; // 온라인 PvP
  if (has(24) || has(37) || has(39)) return 'local'; // 같은 화면; 온라인 지원으로 추정하지 않는다.
  if (has(9)) return 'coop';
  if (has(1) || has(27)) return 'multiplayer';
  return 'single';
}

// 스토어 카테고리는 최대 동시 인원을 제공하지 않는다. 인원수는 추측하지 않는다.
// 성공한 응답만 기존 Steam DB 캐시에 하루 보관하고 오류는 다음 요청에서 재시도한다.
export async function getPlaySupport(appId: number): Promise<PlaySupport> {
  const existing = pending.get(appId);
  if (existing) return existing;
  const work = (async (): Promise<PlaySupport> => {
    const key = `store:play-support:v1:${appId}`;
    const cached = supportSchema.safeParse(await steamCacheGet(key));
    if (cached.success) { await steamStat('hit'); return cached.data; }
    await steamStat('miss');
    try {
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,categories&l=koreana`, {
        signal: AbortSignal.timeout(3000), cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      const body: unknown = await res.json();
      const record = z.record(z.string(), z.unknown()).safeParse(body);
      const parsed = responseSchema.safeParse(record.success ? record.data[String(appId)] : undefined);
      if (!parsed.success || parsed.data.data.steam_appid !== appId) throw new Error('invalid_response');
      const support = parsed.data.data.type === 'game' ? supportFromCategories(parsed.data.data.categories.map(c => c.id)) : 'single';
      await steamCachePut(key, support, 86400);
      return support;
    } catch {
      await steamStat('error', 'store/appdetails', 'unavailable');
      return 'unknown';
    }
  })();
  pending.set(appId, work);
  try { return await work; } finally { pending.delete(appId); }
}
