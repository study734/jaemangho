import type { CatalogGame, TasteTag } from '../../domain/steam-personal';

// Small, source-checked starting catalog, not the entire Steam store. Extend this
// table with evidence, never infer party size from a server cap or a co-op tag.
const game = (appId: number, name: string, tags: TasteTag[], max: number, solo = true, min = solo ? 1 : 2): CatalogGame => ({
  appId, name, tags, modes: [...(solo ? [{ label: '싱글플레이', min: 1, max: 1, online: false }] : []),
    { label: '온라인 플레이', min, max, online: true }],
  source: `https://store.steampowered.com/app/${appId}/`, checkedAt: '2026-10-16',
});
export const recommendationCatalog: CatalogGame[] = [
  game(620, 'Portal 2', ['action', 'adventure', 'puzzle', 'platformer', 'coop'], 2, true, 2),
  game(548430, 'Deep Rock Galactic', ['action', 'shooter', 'survival', 'coop'], 4),
  game(477160, 'Human Fall Flat', ['adventure', 'casual', 'puzzle', 'platformer', 'coop'], 8),
  game(945360, 'Among Us', ['casual', 'party', 'social'], 15, false, 4),
  game(1599600, 'PlateUp!', ['strategy', 'simulation', 'cooking', 'roguelike', 'coop'], 4),
  game(728880, 'Overcooked! 2', ['casual', 'simulation', 'cooking', 'party', 'coop'], 4),
  { ...game(1426210, 'It Takes Two', ['action', 'adventure', 'puzzle', 'platformer', 'coop'], 2, false), note: 'Friend’s Pass가 있어 보유 목록에 없더라도 참여할 수 있어요. Steam에서 이용 조건을 확인해 주세요.' },
  game(892970, 'Valheim', ['action', 'adventure', 'rpg', 'survival', 'crafting', 'coop'], 10),
  game(632360, 'Risk of Rain 2', ['action', 'shooter', 'roguelike', 'coop'], 4),
  game(2567870, 'Chained Together', ['adventure', 'puzzle', 'platformer', 'coop'], 4),
];
export const catalogIds = new Set(recommendationCatalog.map(game => game.appId));
