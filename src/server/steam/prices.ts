import { z } from 'zod';
import { steamCacheGet, steamCachePut, steamStat } from './cache';

// 한국 스토어 가격. 금액은 Steam이 원 단위의 100배 정수로 준다(1100000 = ₩11,000).
export interface Price { final: number; initial: number; discountPercent: number }
// 값 null: 스토어에 가격이 없음(무료·미출시 등). 키 없음: 확인하지 못함.
export type PriceMap = Map<number, Price | null>;

const entrySchema = z.object({ success: z.literal(true), data: z.union([z.array(z.unknown()), z.object({ price_overview: z.object({
  currency: z.literal('KRW'), initial: z.number().int(), final: z.number().int(), discount_percent: z.number().int(),
}).optional() })]) });
const cachedSchema = z.record(z.string(), z.object({ final: z.number(), initial: z.number(), discountPercent: z.number() }).nullable());
const PRICE_TTL = 3600; // 세일은 하루 단위로 바뀌므로 1시간 캐시로 충분하다.

export function parsePrices(body: unknown, appIds: number[]): PriceMap {
  const prices: PriceMap = new Map();
  const record = z.record(z.string(), z.unknown()).safeParse(body);
  if (!record.success) return prices;
  for (const appId of appIds) {
    const entry = entrySchema.safeParse(record.data[String(appId)]);
    if (!entry.success) continue;
    const overview = Array.isArray(entry.data.data) ? undefined : entry.data.data.price_overview;
    prices.set(appId, overview ? { final: overview.final / 100, initial: overview.initial / 100, discountPercent: overview.discount_percent } : null);
  }
  return prices;
}

// 여러 앱을 한 번에 조회한다(price_overview 필터만 일괄 조회를 지원한다). 전체 실패는 null.
export async function getKrPrices(appIds: number[]): Promise<PriceMap | null> {
  const ids = [...new Set(appIds)].sort((a, b) => a - b);
  if (!ids.length) return new Map();
  const key = `store:prices:kr:v1:${ids.join(',')}`;
  const cached = cachedSchema.safeParse(await steamCacheGet(key));
  if (cached.success) { await steamStat('hit'); return new Map(Object.entries(cached.data).map(([id, price]) => [Number(id), price])); }
  await steamStat('miss');
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&filters=price_overview&cc=kr&l=koreana`, {
      signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const prices = parsePrices(await res.json(), ids);
    if (!prices.size) throw new Error('invalid_response');
    await steamCachePut(key, Object.fromEntries(prices), PRICE_TTL);
    return prices;
  } catch (error) {
    const code = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout'
      : error instanceof Error && /^(http_\d+|invalid_response)$/.test(error.message) ? error.message : 'network';
    await steamStat('error', 'store/appdetails/prices', code);
    return null;
  }
}
