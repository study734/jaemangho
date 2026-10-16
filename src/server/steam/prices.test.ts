import { expect, it } from 'vitest';
import { parsePrices } from './prices';

const overview = (initial: number, final: number, discount_percent: number, currency = 'KRW') =>
  ({ success: true, data: { price_overview: { currency, initial, final, discount_percent } } });

it('금액을 원 단위로 바꾸고 무료·실패·형식 오류·다른 통화를 구분한다', () => {
  const prices = parsePrices({
    620: overview(1100000, 1100000, 0), 945360: overview(550000, 330000, 40),
    730: { success: true, data: [] }, 1: { success: false }, 2: { success: true, data: { price_overview: { final: 'x' } } }, 3: overview(100, 100, 0, 'USD'),
  }, [620, 945360, 730, 1, 2, 3, 4]);
  expect(prices.get(620)).toEqual({ final: 11000, initial: 11000, discountPercent: 0 });
  expect(prices.get(945360)).toEqual({ final: 3300, initial: 5500, discountPercent: 40 });
  expect(prices.get(730)).toBeNull(); // 가격 없음
  for (const unknown of [1, 2, 3, 4]) expect(prices.has(unknown)).toBe(false); // 확인하지 못함
  expect(parsePrices('<html>', [620]).size).toBe(0);
});
