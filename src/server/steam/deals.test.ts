import { expect, it, vi } from 'vitest';
import type { CatalogGame } from '../../domain/steam-personal';
import type { OwnedGame } from './client';
import { buildDeals, dealsQuerySchema, getDeals } from './deals';
import type { PriceMap } from './prices';

const online = (appId: number, name: string, min: number, max: number): CatalogGame =>
  ({ appId, name, tags: [], modes: [{ label: '온라인', min, max, online: true }], source: '', checkedAt: '' });
const single: CatalogGame = { appId: 9, name: '혼자', tags: [], modes: [{ label: '싱글', min: 1, max: 1, online: false }], source: '', checkedAt: '' };
const catalog = [online(1, 'A', 2, 4), online(2, 'B', 2, 4), online(3, 'C', 2, 4), online(4, 'D', 4, 8), single];
const own = (...appIds: number[]): OwnedGame[] => appIds.map(appId => ({ appId, name: `g${appId}`, minutes: 0 }));
const prices: PriceMap = new Map([[1, { final: 10000, initial: 10000, discountPercent: 0 }], [2, { final: 3000, initial: 6000, discountPercent: 50 }]]);

it('인원에 맞고 누군가 없는 게임만 세일·적은 미보유자 순으로 보여준다', () => {
  const result = buildDeals(['a', 'b'], [own(1, 3), own(2, 3)], prices, catalog);
  // C는 모두 보유, D는 4명 이상만, 싱글 게임은 제외
  expect(result.alreadyOwned).toBe(1);
  expect(result.deals.map(deal => [deal.appId, deal.missingIds])).toEqual([[2, ['a']], [1, ['b']]]);
  expect(result.deals[0].price?.discountPercent).toBe(50);
});

it('가격을 못 읽어도 보유 현황은 유지한다', () => {
  expect(buildDeals(['a', 'b'], [own(), own()], null, catalog).deals.map(deal => [deal.appId, deal.price])).toEqual([[1, null], [2, null], [3, null]]);
  expect(buildDeals(['a', 'b', 'c', 'd'], [own(), own(), own(), own()], prices, catalog).deals.map(deal => deal.appId)).toContain(4);
});

const ids = ['76561190000000001', '76561190000000002'];
const deps = (library: (id: string) => Promise<{ ok: false } | { ok: true; games: OwnedGame[] }>, registered = ids) =>
  ({ registered: vi.fn(async () => registered), library: vi.fn(library), prices: vi.fn(async () => prices) });

it('등록되지 않은 사람은 조회 전에 거부한다', async () => {
  const d = deps(async () => ({ ok: true, games: [] }), [ids[0]]);
  expect(await getDeals(ids, d)).toEqual({ unknownIds: [ids[1]] });
  expect(d.library).not.toHaveBeenCalled();
});

it('한 명이라도 보유 목록이 비공개면 보류한다', async () => {
  const d = deps(async id => id === ids[1] ? { ok: false } : { ok: true, games: [] });
  expect(await getDeals(ids, d)).toEqual({ deals: [], excluded: [ids[1]], alreadyOwned: 0, pricesUnavailable: false });
});

it('가격 조회 실패를 표시한다', async () => {
  const d = { ...deps(async () => ({ ok: true, games: [] })), prices: vi.fn(async () => null) };
  const result = await getDeals(ids, d) as Awaited<ReturnType<typeof getDeals>> & { pricesUnavailable: boolean };
  expect(result.pricesUnavailable).toBe(true);
});

it('2~20명의 등록 ID만 받는다', () => {
  expect(dealsQuerySchema.safeParse({ ids: ids.join(',') }).success).toBe(true);
  expect(dealsQuerySchema.safeParse({ ids: ids[0] }).success).toBe(false);
  expect(dealsQuerySchema.safeParse({ ids: 'x,y' }).success).toBe(false);
});
