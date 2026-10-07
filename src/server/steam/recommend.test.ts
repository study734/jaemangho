import { describe, expect, it } from 'vitest';
import { rankCandidates, unownedCandidates } from './recommend';

const game = (appId: number, minutes: number) => ({ appId, name: `game ${appId}`, minutes });
describe('Steam 추천 순위', () => {
  it('전원이 가진 게임만 추천하고 경험이 고른 게임을 한 사람만 오래 한 게임보다 높인다', () => {
    const ranked = rankCandidates([[game(1, 480), game(2, 100000), game(3, 60)], [game(1, 480), game(2, 0)]], 'balanced');
    expect(ranked.map(g => g.appId)).toEqual([1, 2]);
    expect(ranked[0].reasons).toContain('모두 플레이 경험이 있어요');
    expect(ranked[1]).toMatchObject({ playedBy: 1, beginnerCount: 1, minMinutes: 0, maxMinutes: 100000, totalMinutes: 100000 });
  });
  it('선택한 기준에 따라 익숙한 게임과 새 게임의 순서가 바뀐다', () => {
    const libraries = [[game(1, 480), game(2, 0)], [game(1, 480), game(2, 0)]];
    expect(rankCandidates(libraries, 'familiar')[0].appId).toBe(1);
    const fresh = rankCandidates(libraries, 'fresh');
    expect(fresh[0].appId).toBe(2);
    expect(fresh[0].reasons).toContain('모두 아직 플레이하지 않은 게임');
    expect(fresh.every(g => Number.isFinite(g.score) && g.score >= 0 && g.score <= 100)).toBe(true);
  });
  it('8시간 이후 경험 점수는 증가하지 않고 동점은 appId 순으로 재현된다', () => {
    const result = rankCandidates([[game(2, 100000), game(1, 480)], [game(2, 100000), game(1, 480)]], 'familiar');
    expect(result.map(g => g.appId)).toEqual([1, 2]);
    expect(result[0].score).toBe(result[1].score);
  });
  it('중복 appId는 한 번만 세고 입력을 변경하지 않는다', () => {
    const libraries = [[game(1, 20), game(1, 60)], [game(1, 60)]];
    const before = structuredClone(libraries);
    expect(rankCandidates(libraries, 'balanced')).toHaveLength(1);
    expect(libraries).toEqual(before);
  });
  it('한 명 이하이거나 공통 보유 게임이 없으면 추천하지 않는다', () => {
    expect(rankCandidates([], 'balanced')).toEqual([]);
    expect(rankCandidates([[game(1, 60)]], 'balanced')).toEqual([]);
    expect(rankCandidates([[game(1, 60)], []], 'balanced')).toEqual([]);
  });
  it('일부 보유 포함은 첫 번째 사람에게 없는 게임도 후보로 만들고 보유자 경험만 계산한다', () => {
    const ranked = rankCandidates([[game(1, 60)], [game(1, 60), game(2, 480)]], 'familiar', 'any');
    expect(ranked.map(g => g.appId)).toContain(2);
    expect(ranked.find(g => g.appId === 2)).toMatchObject({ owners: 1, ownerIndexes: [1], playedBy: 1, minMinutes: 480, maxMinutes: 480 });
    expect(ranked.find(g => g.appId === 2)?.reasons).toContain('선택한 2명 중 1명 보유');
    expect(ranked.find(g => g.appId === 2)?.reasons).not.toContain('모두 플레이 경험이 있어요');
  });
  it('동일한 경험이면 더 많은 멤버가 보유한 게임이 우선이다', () => {
    const ranked = rankCandidates([[game(1, 480), game(2, 480)], [game(2, 480)]], 'familiar', 'any');
    expect(ranked.map(g => g.appId)).toEqual([2, 1]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
  it('미보유 후보는 누구의 목록에라도 있는 게임을 제거하고 인기·신규 목록 순서를 유지한다', () => {
    const catalog = [game(9, 0), game(2, 0), game(1, 0), game(8, 0), game(9, 0)];
    const candidates = unownedCandidates([[game(1, 60)], [game(2, 60)]], catalog);
    expect(candidates.map(g => g.appId)).toEqual([9, 8]);
    expect(candidates[0]).toMatchObject({ owners: 0, ownerIndexes: [], beginnerCount: 0 });
    expect(candidates[0].reasons).not.toContain('모두 아직 플레이하지 않은 게임');
    expect(unownedCandidates([], catalog)).toEqual([]);
  });
});
