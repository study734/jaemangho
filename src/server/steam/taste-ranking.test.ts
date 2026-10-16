import { expect, it } from 'vitest';
import { emptyTaste } from '../../domain/steam-personal';
import { affinity, type MemberSignal } from './taste-ranking';
import { recommendationCatalog } from './catalog';

it('uses personal signals to calculate participant affinity for common games', () => {
  const metadata = new Map(recommendationCatalog.map(game => [game.appId, game.tags]));
  const member: MemberSignal = { steamId: 'one', games: [{ appId: 620, name: 'Portal 2', minutes: 120 }], recent: [], taste: emptyTaste() };
  const game = recommendationCatalog.find(game => game.appId === 548430)!;
  const before = affinity(game, member, metadata).value;
  member.taste.likedGames = [548430];
  expect(affinity(game, member, metadata).value).toBeGreaterThan(before);
  member.taste.avoids = ['shooter'];
  expect(affinity(game, member, metadata).value).toBeLessThan(1);
  member.games = []; member.taste = emptyTaste();
  expect(affinity(game, member, new Map()).hasSignal).toBe(false);
});
