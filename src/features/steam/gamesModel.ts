import { steamErrorMessage, type steamApi, type SteamMember, type Mode, type Preference, type OwnershipScope,
  type GamesResult, type RecommendationsResult, type Recommendation, type MissionsResult } from './api';
import { drawGame } from './draw';

export const GAME_PAGE_SIZE = 50;
export interface GamesSnapshot {
  query: string;
  input: string;
  members: SteamMember[];
  selected: string[];
  mode: Mode;
  preference: Preference;
  scope: OwnershipScope;
  result: { mode: Mode; ids: string[]; data: GamesResult } | null;
  recommendations: { ids: string[]; preference: Preference; scope: OwnershipScope; data: RecommendationsResult } | null;
  drawn: Recommendation | null;
  missionResult: { game: Recommendation; data: MissionsResult } | null;
  visibleLimit: number;
  busy: 'add' | 'compare' | 'recommend' | 'remove' | 'missions' | null;
  loading: boolean;
  error: string | null;
}

// A single snapshot keeps the chosen conditions and the result that belongs to
// them together. The module owns request guards; disabled UI is not the guard.
export function createGamesModel(api: Pick<typeof steamApi, 'list' | 'add' | 'remove' | 'games' | 'recommendations' | 'missions'>,
  initialQuery = '', random = Math.random) {
  const initialSnapshot: GamesSnapshot = { query: initialQuery, input: '', members: [], selected: [], mode: 'common',
    preference: 'balanced', scope: 'all', result: null, recommendations: null, drawn: null, missionResult: null,
    visibleLimit: GAME_PAGE_SIZE, busy: null, loading: true, error: null };
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const update = (change: Partial<GamesSnapshot>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(listener => listener()); };
  const extras = { drawn: null, missionResult: null };
  const results = { result: null, recommendations: null, ...extras };
  let loading: Promise<void> | null = null;

  async function command(kind: NonNullable<GamesSnapshot['busy']>, work: () => Promise<void>) {
    if (snapshot.busy) return;
    update({ busy: kind, error: null });
    try { await work(); }
    catch (error) { update({ error: steamErrorMessage(error) }); }
    finally { update({ busy: null }); }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    loadMembers() {
      if (loading) return loading;
      if (snapshot.busy) return Promise.resolve();
      update({ loading: true, error: null });
      loading = (async () => {
        try {
          const members = await api.list();
          update({ members, selected: snapshot.selected.filter(id => members.some(member => member.steamId === id)) });
        } catch (error) { update({ error: steamErrorMessage(error) }); }
        finally { update({ loading: false }); }
      })().finally(() => { loading = null; });
      return loading;
    },
    setInput: (input: string) => update({ input }),
    setQuery(query: string) { if (!snapshot.busy) update({ query, visibleLimit: GAME_PAGE_SIZE, ...extras }); },
    setMode(mode: Mode) { if (!snapshot.busy) update({ mode, result: null }); },
    setPreference(preference: Preference) { if (!snapshot.busy) update({ preference, recommendations: null, ...extras }); },
    setScope(scope: OwnershipScope) { if (!snapshot.busy) update({ scope, recommendations: null, ...extras }); },
    toggle(id: string) {
      if (snapshot.busy || !snapshot.members.some(member => member.steamId === id)) return;
      const selected = snapshot.selected.includes(id) ? snapshot.selected.filter(value => value !== id)
        : snapshot.selected.length < 20 ? [...snapshot.selected, id] : snapshot.selected;
      update({ selected, ...results });
    },
    add() {
      const input = snapshot.input.trim();
      if (snapshot.loading || !input) return Promise.resolve();
      return command('add', async () => {
        const member = await api.add(input);
        update({ members: [member, ...snapshot.members], input: snapshot.input.trim() === input ? '' : snapshot.input });
      });
    },
    remove(id: string) {
      return command('remove', async () => {
        await api.remove(id);
        update({ members: snapshot.members.filter(member => member.steamId !== id),
          selected: snapshot.selected.filter(value => value !== id), ...results });
      });
    },
    compare() {
      if (!snapshot.selected.length || snapshot.busy) return Promise.resolve();
      const { selected: ids, mode } = snapshot;
      update({ visibleLimit: GAME_PAGE_SIZE, ...results });
      return command('compare', async () => { update({ result: { mode, ids, data: await api.games(ids, mode) } }); });
    },
    recommend() {
      if (snapshot.selected.length < 2 || snapshot.busy) return Promise.resolve();
      const { selected: ids, preference, scope } = snapshot;
      update(results);
      return command('recommend', async () => {
        update({ recommendations: { ids, preference, scope, data: await api.recommendations(ids, preference, scope) } });
      });
    },
    findMissions(game: Recommendation) {
      if (!snapshot.recommendations || game.missingIds.length || snapshot.busy) return Promise.resolve();
      const ids = snapshot.recommendations.ids;
      update({ missionResult: null });
      return command('missions', async () => { update({ missionResult: { game, data: await api.missions(ids, game.appId) } }); });
    },
    draw() {
      if (snapshot.busy) return;
      const query = snapshot.query.trim().toLocaleLowerCase();
      const candidates = snapshot.recommendations?.data.games.filter(game => game.name.toLocaleLowerCase().includes(query)) ?? [];
      update({ drawn: drawGame(candidates, snapshot.drawn?.appId ?? null, random()) });
    },
    showMore: () => update({ visibleLimit: snapshot.visibleLimit + GAME_PAGE_SIZE }),
  };
}
