import { describe, expect, it } from 'vitest';
import { emptyTaste, type CatalogGame } from '../../domain/steam-personal';
import { recommendationCatalog } from './catalog';
import { rankByTaste, type MemberSignal } from './taste-ranking';

const catalog = recommendationCatalog;
const metadata = new Map(catalog.map(game => [game.appId, game.tags]));
const member = (id = 'one'): MemberSignal => ({ steamId: id, games: [{ appId: 620, name: 'Portal 2', minutes: 120 }], recent: [], taste: emptyTaste() });
const options = { kind: 'personal' as const, scope: 'any' as const, solo: false, examples: [] };
describe('personal and group taste ranking', () => {
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
  it('checks the actual selected party against online minimum and maximum, excluding local and unknown modes', () => {
    for (const count of [2, 3, 4, 8, 10, 15, 20]) {
      const ranked = rankByTaste(catalog, Array.from({ length: count }, (_, i) => member(String(i))), metadata, { ...options, kind: 'group' });
      expect(ranked.every(game => game.modes.every(mode => mode.online && mode.min <= count && mode.max >= count))).toBe(true);
      if (count < 4) expect(ranked.some(game => game.appId === 945360)).toBe(false);
      if (count > 2) expect(ranked.some(game => game.appId === 620)).toBe(false);
      if (count > 15) expect(ranked).toEqual([]);
    }
    const local: CatalogGame = { ...catalog[0], modes: [{ label: '같은 화면', min: 2, max: 4, online: false }] };
    expect(rankByTaste([local, { ...local, modes: [] }], [member(), member('two')], metadata, { ...options, kind: 'group' })).toEqual([]);
  });
  it('handles ownership, solo mode and empty evidence without invented scores', () => {
    expect(rankByTaste(catalog, [member()], metadata, { ...options, scope: 'all' }).map(game => game.appId)).toEqual([620]);
    expect(rankByTaste(catalog, [member()], metadata, { ...options, scope: 'new' }).some(game => game.appId === 620)).toBe(false);
    expect(rankByTaste(catalog, [member()], metadata, { ...options, solo: true }).every(game => game.modes.every(mode => mode.min === 1))).toBe(true);
    const one = member(); one.games = [];
    expect(rankByTaste(catalog, [one], metadata, options).every(game => game.score === null)).toBe(true);
  });
  it('balances all participants rather than using only the requester preference', () => {
    const puzzle = { ...catalog[0], appId: 1, tags: ['puzzle' as const] };
    const cooking = { ...catalog[0], appId: 2, tags: ['cooking' as const] };
    const one = member(), two = member('two'); one.games = []; two.games = [];
    one.taste.likes = ['puzzle']; two.taste.likes = ['cooking'];
    const ranked = rankByTaste([puzzle, cooking], [one, two], new Map(), { ...options, kind: 'group' });
    expect(ranked[0].score).toBe(ranked[1].score);
    two.taste.likes = ['puzzle'];
    expect(rankByTaste([puzzle, cooking], [one, two], new Map(), { ...options, kind: 'group' })[0].appId).toBe(1);
  });
  it('labels overlapping individual play separately from reported shared play', () => {
    for (const source of ['steam-overlap', 'user-reported'] as const) {
      const ranked = rankByTaste(catalog, [member(), member('two')], metadata, { ...options, kind: 'group', examples: [{ appId: 620, name: 'Portal 2', players: 2, source }] });
      expect(ranked.find(game => game.appId === 477160)!.reasons.join(' ')).toContain(source === 'steam-overlap' ? '각각 플레이한' : '함께했다고 남긴');
    }
  });
});
