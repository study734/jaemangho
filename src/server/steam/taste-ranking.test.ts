import { describe, expect, it } from 'vitest';
import { emptyTaste } from '../../domain/steam-personal';
import { recommendationCatalog } from './catalog';
import { rankByTaste, type MemberSignal } from './taste-ranking';

const catalog = recommendationCatalog;
const metadata = new Map(catalog.map(game => [game.appId, game.tags]));
const member = (id = 'one'): MemberSignal => ({ steamId: id, games: [{ appId: 620, name: 'Portal 2', minutes: 120 }], recent: [], taste: emptyTaste() });
const options = { scope: 'any' as const, solo: false };
describe('personal taste ranking', () => {
  it('uses played-game similarity and explicit likes ahead of playtime', () => {
    const one = member();
    const inferred = rankByTaste(catalog, [one], metadata, options);
    expect(inferred.find(game => game.appId === 477160)!.score).toBeGreaterThan(inferred.find(game => game.appId === 945360)!.score!);
    one.taste.likes = ['cooking'];
    const ranked = rankByTaste(catalog, [one], metadata, options);
    expect([1599600, 728880]).toContain(ranked[0].appId);
    expect(ranked[0].reasons).toContain('1명의 저장한 선호와 일치');
  });
  it('treats explicit exclusions as hard filters and disliked tags as penalties', () => {
    const one = member(); one.taste.likedGames = [548430];
    const before = rankByTaste(catalog, [one], metadata, options).find(game => game.appId === 548430)!.score!;
    one.taste.avoids = ['shooter'];
    expect(rankByTaste(catalog, [one], metadata, options).find(game => game.appId === 548430)!.score).toBeLessThan(before);
    one.taste.avoidedGames = [548430];
    expect(rankByTaste(catalog, [one], metadata, options).some(game => game.appId === 548430)).toBe(false);
  });
  it('handles ownership, solo mode and empty evidence without invented scores', () => {
    expect(rankByTaste(catalog, [member()], metadata, { ...options, scope: 'all' }).map(game => game.appId)).toEqual([620]);
    expect(rankByTaste(catalog, [member()], metadata, { ...options, scope: 'new' }).some(game => game.appId === 620)).toBe(false);
    expect(rankByTaste(catalog, [member()], metadata, { ...options, solo: true }).every(game => game.modes.every(mode => mode.min === 1))).toBe(true);
    const one = member(); one.games = [];
    expect(rankByTaste(catalog, [one], metadata, options).every(game => game.score === null)).toBe(true);
  });
});
