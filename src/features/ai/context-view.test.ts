import { expect, it } from 'vitest';
import { contextView } from './context-view';

it('labels recent minutes separately from cumulative play time', () => {
  const view = contextView({ topic: 'steam', mode: 'recent', people: 2, excluded: 0, unverified: 0, recentUnavailable: 0, games: [{ name: 'Portal 2', totalMinutes: 600, recentMinutes: 120, owners: 2 }] });
  expect(view.title).toBe('Steam 최근 2주 플레이');
  expect(view.items[0].detail).toContain('최근 2주 합계 2시간');
  expect(view.items[0].detail).not.toContain('10시간');
});
it('shows mission failure, unsupported and complete states without inventing goals', () => {
  for (const [state, expected] of [['unavailable', '진행도 확인 불가'], ['unsupported', '공개 과제 지원 안 함'], ['complete', '확인한 공개 과제 전원 달성']]) {
    const view = contextView({ topic: 'steam', mode: 'missions', people: 2, excluded: 0, unverified: 0, recentUnavailable: 0, games: [], missions: { state, goals: [] } });
    expect(view.summary).toContain(expected);
    expect(view.items).toEqual([]);
    if (state === 'unavailable') expect(view.warning).not.toBe('');
  }
});
