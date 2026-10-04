import { describe, expect, it } from 'vitest';
import { commonGames, unplayedByAll } from './compare';

const g = (appId: number, minutes: number, name = `g${appId}`) => ({ appId, name, minutes });

describe('commonGames', () => {
  it('전원이 가진 게임만, 합산 플레이 시간순', () => {
    const a = [g(1, 10), g(2, 500), g(3, 0)];
    const b = [g(2, 100), g(1, 5), g(4, 9)];
    expect(commonGames([a, b]).map((e) => [e.appId, e.totalMinutes])).toEqual([[2, 600], [1, 15]]);
  });
  it('한 명뿐이면 그 사람의 게임 전부, 아무도 없으면 빈 목록', () => {
    expect(commonGames([[g(1, 1)]])).toHaveLength(1);
    expect(commonGames([])).toEqual([]);
  });
});

describe('unplayedByAll', () => {
  it('모두 가졌고 합산 0분인 게임만', () => {
    const a = [g(1, 0), g(2, 0), g(3, 7)];
    const b = [g(1, 0), g(2, 3), g(3, 0)];
    expect(unplayedByAll([a, b]).map((e) => e.appId)).toEqual([1]);
  });
});
