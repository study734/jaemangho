import { describe, expect, it, vi } from 'vitest';
import { emptyTaste } from '../../domain/steam-personal';
import { rankGroupCandidates } from './group-ranking';
import { rankCandidates, unownedCandidates } from './recommend';
import { recommendationCatalog } from './catalog';

const ids = ['one', 'two'];
const library = [{ appId: 620, name: 'Portal 2', minutes: 240 }];
function deps() {
  return { tastes: vi.fn(async () => new Map()), activity: vi.fn(async () => new Map()),
    metadata: vi.fn(async (id: number) => recommendationCatalog.find(game => game.appId === id)?.tags ?? null) };
}
const candidates = () => unownedCandidates([library, library], recommendationCatalog.filter(game => game.appId !== 620));

describe('group taste and play ranking', () => {
  it('blends every participant, applies consented likes and excludes any explicit veto', async () => {
    const d = deps();
    d.tastes.mockResolvedValue(new Map(ids.map(id => [id, { ...emptyTaste(), likes: ['cooking'] }])));
    const result = await rankGroupCandidates(candidates(), ids, [library, library], [[], []], undefined, d);
    expect([1599600, 728880]).toContain(result.candidates[0].appId);
    expect(result.sharedPreferences).toBe(2);
    expect(result.candidates[0].reasons).toContain('공통 추천 반영에 동의한 저장 취향과 일치');
    d.tastes.mockResolvedValue(new Map([['two', { ...emptyTaste(), avoidedGames: [1599600, 728880] }]]));
    expect((await rankGroupCandidates(candidates(), ids, [library, library], [[], []], undefined, d)).candidates.some(game => [1599600, 728880].includes(game.appId))).toBe(false);
  });
  it('does not invent similarity when metadata is unavailable and preserves discovery order', async () => {
    const d = deps(); d.metadata.mockResolvedValue(null);
    const input = [...candidates()].reverse();
    const result = await rankGroupCandidates(input, ids, [library, library], [null, null], undefined, d);
    expect(result.personalizedIds.size).toBe(0);
    expect(result.metadataUnavailable).toBeGreaterThan(0);
    expect(result.candidates.map(game => game.appId)).toEqual(input.map(game => game.appId));
  });
  it('allocates at most 24 source titles across members and stops after cancellation', async () => {
    const d = deps(), controller = new AbortController();
    const libraries = ids.map((_, index) => Array.from({ length: 100 }, (_, i) => ({ appId: index * 1000 + i + 1, name: 'game', minutes: 100 - i })));
    await rankGroupCandidates([candidates()[0]], ids, libraries, [[], []], undefined, d);
    expect(d.metadata).toHaveBeenCalledTimes(25);
    expect(d.metadata).toHaveBeenCalledWith(1); expect(d.metadata).toHaveBeenCalledWith(1001);
    d.metadata.mockImplementation(async () => { controller.abort(); return null; });
    d.metadata.mockClear();
    await expect(rankGroupCandidates(candidates(), ids, libraries, [[], []], controller.signal, d)).rejects.toThrow();
    expect(d.metadata).toHaveBeenCalledTimes(8);
  });
  it('uses stored observation increases as a weak activity signal', async () => {
    const d = deps();
    const libraries = ids.map(() => [{ appId: 620, name: 'Portal 2', minutes: 120 }, { appId: 1599600, name: 'PlateUp!', minutes: 120 }]);
    const input = rankCandidates(libraries, 'balanced');
    const before = await rankGroupCandidates(input, ids, libraries, [[], []], undefined, d);
    d.activity.mockResolvedValue(new Map(ids.map(id => [id, [{ appId: 1599600, minutes: 30 }]])));
    const after = await rankGroupCandidates(input, ids, libraries, [[], []], undefined, d);
    expect(after.candidates.find(game => game.appId === 1599600)!.score).toBeGreaterThan(before.candidates.find(game => game.appId === 1599600)!.score);
    expect(after.candidates[0].reasons).toContain('동의 후 저장한 최근 30일 관측 증가분 반영');
  });
});
