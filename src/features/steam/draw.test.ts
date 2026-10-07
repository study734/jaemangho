import { expect, it } from 'vitest';
import { drawGame } from './draw';
it('현재 후보에서만 뽑고 둘 이상이면 직전 선택을 제외한다', () => {
  const games = [{ appId: 1 }, { appId: 2 }, { appId: 3 }];
  expect(drawGame([], null, 0)).toBeNull();
  expect(drawGame([games[0]], 1, 0.9)).toBe(games[0]);
  expect(drawGame(games, 1, 0)).toBe(games[1]);
  expect(drawGame(games, 1, 0.99)).toBe(games[2]);
});
it.each([-1, 1, NaN, Infinity])('잘못된 난수 %s 거부', roll => expect(() => drawGame([], null, roll)).toThrow(RangeError));
