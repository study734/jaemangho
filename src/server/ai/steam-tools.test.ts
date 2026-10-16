import { beforeEach, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ library: vi.fn(), recent: vi.fn(), compare: vi.fn(), recommend: vi.fn(), missions: vi.fn(), members: vi.fn() }));
vi.mock('../steam/client', () => ({ getLibrary: fakes.library, getRecentGames: fakes.recent }));
vi.mock('../steam/games', () => ({ compareGames: fakes.compare }));
vi.mock('../steam/recommendations', () => ({ recommendGames: fakes.recommend }));
vi.mock('../steam/missions', () => ({ findMissions: fakes.missions }));
vi.mock('../steam/roster', () => ({ listSteamMembers: fakes.members }));
vi.mock('../lol/roster', () => ({ listRoster: async () => [] }));
vi.mock('../steam/personalized', () => ({ personalizedGames: vi.fn() }));
import { memberChoices, parseTool, readTool, toolDefinitions } from './tools';
import { steamRead } from './steam-tools';
const ids = ['76561190000000001', '76561190000000002'];
const signal = () => new AbortController().signal;
const game = { appId: 620, name: 'Portal 2', totalMinutes: 120, owners: 2 };
beforeEach(() => {
  vi.resetAllMocks();
  fakes.members.mockResolvedValue(ids.map(steamId => ({ steamId, name: 'private-name' })));
  fakes.library.mockResolvedValue({ ok: true, games: [{ appId: 620, name: 'Portal 2', minutes: 60 }] });
  fakes.recent.mockResolvedValue({ ok: true, games: [{ appId: 620, minutes: 10 }] });
  fakes.compare.mockResolvedValue({ games: [game], excluded: [] });
  fakes.recommend.mockResolvedValue({ games: [game, { ...game, appId: 548430, name: 'Deep Rock Galactic' }].map(entry => ({ ...entry, score: 50, support: 'coop', reasons: ['모두 보유'] })), excluded: [], unverified: 0, recentUnavailable: [], totalCandidates: 2, checked: 2 });
});
it('validates native arguments, rejects IDs/URLs/unknown fields and exposes bounded schemas', () => {
  expect(parseTool('get_personal_games', '{"scope":"new","solo":true}')).toEqual({ name: 'get_personal_games', args: { scope: 'new', solo: true } });
  expect(parseTool('get_steam_recommendations', '{"scope":"unowned","preference":"recent"}').args).toEqual({ scope: 'unowned', preference: 'recent' });
  for (const [name, args] of [['get_group_games', '{"solo":true}'], ['get_steam_library', '{"ids":["x"]}'], ['get_game_missions', '{"appId":620}'], ['get_steam_recommendations', '{"scope":"all","url":"https://x.test"}']]) expect(() => parseTool(name, args)).toThrow();
  expect(toolDefinitions.find(tool => tool.function.name === 'get_game_missions')?.function.parameters).toMatchObject({ required: ['game'], additionalProperties: false });
});
it('resolves only registered UI selections before querying and removes identifying fields', async () => {
  const choices = await memberChoices();
  const result = await readTool('get_steam_library', { steam: choices.steam.map(member => member.ref), lol: null }, signal(), 'actor', { sort: 'recent', query: 'portal' });
  expect(result.context).toMatchObject({ mode: 'recent', scope: 'any', games: [{ name: 'Portal 2', totalMinutes: 120, recentMinutes: 20, owners: 2 }] });
  expect(JSON.stringify(result)).not.toMatch(/7656119|private-name|appId|actor/);
  expect(await readTool('get_steam_library', { steam: ['s_' + '0'.repeat(24)], lol: null }, signal())).toMatchObject({ status: 'selection_required' });
  expect(fakes.library).toHaveBeenCalledTimes(2);
});
it('distinguishes failed libraries and recent records from empty results without cumulative fallback', async () => {
  fakes.library.mockResolvedValueOnce({ ok: false });
  expect(await steamRead('get_steam_library', ids, { sort: 'recent' }, signal())).toMatchObject({ context: { excluded: 1, games: [] } });
  expect(fakes.recent).not.toHaveBeenCalled();
  fakes.recent.mockResolvedValueOnce({ ok: false });
  expect(await steamRead('get_steam_library', ids, { sort: 'recent' }, signal())).toMatchObject({ context: { recentUnavailable: 1, games: [] } });
  fakes.recent.mockResolvedValue({ ok: true, games: [] });
  expect(await steamRead('get_steam_library', ids, { sort: 'recent' }, signal())).toMatchObject({ context: { games: [] } });
});
it('limits library results and searches before the limit', async () => {
  fakes.library.mockResolvedValue({ ok: true, games: Array.from({ length: 30 }, (_, index) => ({ appId: index + 1, name: `Game ${index}`, minutes: index })) });
  const all = await steamRead('get_steam_library', [ids[0]], {}, signal());
  expect(all.context?.topic === 'steam' && all.context.games).toHaveLength(12);
  expect(await steamRead('get_steam_library', [ids[0]], { query: 'Game 0' }, signal())).toMatchObject({ context: { games: [{ name: 'Game 0' }] } });
});
it('does not claim partial common ownership or fetch missions for ambiguous/unowned titles', async () => {
  fakes.compare.mockResolvedValueOnce({ games: [game], excluded: [ids[0]] });
  expect(await steamRead('get_unplayed_games', ids, {}, signal())).toMatchObject({ context: { excluded: 1, games: [] } });
  expect(await steamRead('get_game_missions', ids, { game: 'wrong' }, signal())).toMatchObject({ status: 'selection_required' });
  fakes.compare.mockResolvedValueOnce({ games: [game, { ...game, appId: 999 }], excluded: [] });
  expect(await steamRead('get_game_missions', ids, { game: 'Portal 2' }, signal())).toMatchObject({ status: 'selection_required' });
  expect(fakes.missions).not.toHaveBeenCalled();
});
it('projects only public mission display facts and keeps failure states', async () => {
  fakes.missions.mockResolvedValue({ state: 'ok', missions: [{ id: 'private-achievement', title: '공개 목표', kind: 'team-first', lockedIds: ids, unlockedIds: [] }], unknownAchievements: 1, unavailableIds: [], missingIds: [] });
  const result = await steamRead('get_game_missions', ids, { game: 'PORTAL 2' }, signal());
  expect(fakes.missions).toHaveBeenCalledWith(ids, 620, expect.any(AbortSignal));
  expect(result.context).toMatchObject({ missions: { goals: [{ title: '공개 목표', remaining: 2 }], unknownAchievements: 1 } });
  expect(JSON.stringify(result)).not.toMatch(/7656119|appId|private-achievement/);
  fakes.missions.mockResolvedValue({ state: 'unsupported', missions: [], unknownAchievements: 0, unavailableIds: [], missingIds: [] });
  expect(await steamRead('get_game_missions', ids, { game: 'Portal 2' }, signal())).toMatchObject({ context: { missions: { state: 'unsupported' } } });
});
it('supports personal unplayed and achievement lookup with one selected account', async () => {
  await steamRead('get_unplayed_games', [ids[0]], {}, signal());
  expect(fakes.compare).toHaveBeenCalledWith([ids[0]], 'unplayed');
  fakes.missions.mockResolvedValue({ state: 'complete', missions: [], unknownAchievements: 0, unavailableIds: [], missingIds: [] });
  expect(await steamRead('get_game_missions', [ids[0]], { game: 'Portal 2' }, signal())).toMatchObject({ context: { people: 1, missions: { state: 'complete' } } });
});
it('passes recommendation conditions and excludes known incompatible party sizes before drawing', async () => {
  const result = await steamRead('draw_steam_game', [...ids, '76561190000000003'], { scope: 'any', preference: 'fresh' }, signal());
  expect(fakes.recommend).toHaveBeenCalledWith([...ids, '76561190000000003'], 'fresh', 'any', expect.any(AbortSignal));
  expect(result.context).toMatchObject({ mode: 'draw', games: [{ name: 'Deep Rock Galactic' }] });
  const next = await steamRead('draw_steam_game', ids, { previousGame: 'Portal 2' }, signal());
  expect(next.context).toMatchObject({ games: [{ name: 'Deep Rock Galactic' }] });
  expect(await steamRead('draw_steam_game', [ids[0]], {}, signal())).toMatchObject({ status: 'selection_required' });
});
it('does not start a later stage after abort or hide upstream errors as empty games', async () => {
  const controller = new AbortController();
  fakes.compare.mockImplementationOnce(async () => { controller.abort(); return { games: [game], excluded: [] }; });
  await expect(steamRead('get_game_missions', ids, { game: 'Portal 2' }, controller.signal)).rejects.toThrow();
  expect(fakes.missions).not.toHaveBeenCalled();
  fakes.library.mockRejectedValueOnce(new Error('upstream'));
  await expect(steamRead('get_steam_library', ids, {}, signal())).rejects.toThrow('upstream');
});
