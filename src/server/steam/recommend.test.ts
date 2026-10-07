import { describe, expect, it } from 'vitest';
import { rankCandidates } from './recommend';

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
});
