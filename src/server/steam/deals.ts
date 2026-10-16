import { getLibrary, type OwnedGame } from './client';
import { recommendationCatalog } from './catalog';
import { getKrPrices, type Price, type PriceMap } from './prices';
import { fitsParty, recommendationsQuerySchema } from './recommendations';
import { registeredIds } from './roster';
import type { CatalogGame } from '../../domain/steam-personal';

export const dealsQuerySchema = recommendationsQuerySchema.pick({ ids: true });
export interface Deal { appId: number; name: string; price: Price | null; missingIds: string[] }
export interface DealsResult {
  deals: Deal[];
  excluded: string[];
  // 모두 이미 가진 게임 수. 사야 할 게임이 없다는 것과 가격을 못 읽은 것을 구분한다.
  alreadyOwned: number;
  pricesUnavailable: boolean;
}

// 확인된 협동 카탈로그에서 선택한 인원에 맞고, 한 명이라도 없는 게임을 세일 순으로 정렬한다.
// 카탈로그 밖의 게임은 인원을 확인하지 못했으므로 다루지 않는다.
export function buildDeals(ids: string[], libraries: OwnedGame[][], prices: PriceMap | null, catalog: CatalogGame[] = recommendationCatalog) {
  const owned = libraries.map(lib => new Set(lib.map(game => game.appId)));
  const deals: Deal[] = [];
  let alreadyOwned = 0;
  for (const game of catalog.filter(game => fitsParty(game.appId, ids.length, catalog))) {
    const missingIds = ids.filter((_, index) => !owned[index].has(game.appId));
    if (!missingIds.length) { alreadyOwned++; continue; }
    deals.push({ appId: game.appId, name: game.name, price: prices?.get(game.appId) ?? null, missingIds });
  }
  deals.sort((a, b) => (b.price?.discountPercent ?? 0) - (a.price?.discountPercent ?? 0)
    || a.missingIds.length - b.missingIds.length || a.appId - b.appId);
  return { deals, alreadyOwned };
}

const defaults = { registered: registeredIds, library: getLibrary, prices: getKrPrices };

export async function getDeals(ids: string[], deps = defaults): Promise<DealsResult | { unknownIds: string[] }> {
  const unique = [...new Set(ids)];
  const known = new Set(await deps.registered(unique));
  const unknownIds = unique.filter(id => !known.has(id));
  if (unknownIds.length) return { unknownIds };
  const [libraries, prices] = await Promise.all([Promise.all(unique.map(id => deps.library(id))),
    deps.prices(recommendationCatalog.map(game => game.appId))]);
  const excluded = unique.filter((_, index) => !libraries[index].ok);
  // 한 명이라도 보유 목록을 못 읽으면 '사야 할 사람'을 알 수 없으므로 보류한다.
  if (excluded.length) return { deals: [], excluded, alreadyOwned: 0, pricesUnavailable: prices === null };
  const { deals, alreadyOwned } = buildDeals(unique, libraries.flatMap(lib => lib.ok ? [lib.games] : []), prices);
  return { deals, excluded: [], alreadyOwned, pricesUnavailable: prices === null };
}
