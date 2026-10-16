import { emptyTaste, type GameTaste, type PersonalResult, type TasteSettings } from './personalTypes';

async function json<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(typeof body?.error === 'string' ? body.error : '게임 추천 요청을 완료하지 못했어요.');
  return body;
}
export const personalApi = {
  settings: (signal: AbortSignal) => json<TasteSettings>('/api/steam/taste', signal),
  save: (taste: GameTaste, signal: AbortSignal) => json<{ taste: GameTaste }>('/api/steam/taste', signal, { method: 'PUT', body: JSON.stringify(taste) }),
  clear: (signal: AbortSignal) => json('/api/steam/taste', signal, { method: 'DELETE', body: '{}' }),
  recommend: (input: { kind: 'personal' | 'group'; ids: string[]; scope: 'all' | 'any' | 'new'; solo: boolean }, signal: AbortSignal) =>
    json<PersonalResult>('/api/steam/personalized', signal, { method: 'POST', body: JSON.stringify(input) }),
};

export function createPersonalModel(api = personalApi) {
  const initial = { settings: null as TasteSettings | null, taste: emptyTaste(), saved: emptyTaste(), kind: 'personal' as 'personal' | 'group',
    selected: [] as string[], scope: 'any' as 'all' | 'any' | 'new', solo: false, busy: '' as '' | 'load' | 'save' | 'recommend', result: null as PersonalResult | null, error: '', status: '' };
  let snapshot = initial, revision = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (change: Partial<typeof initial>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); };
  async function run(kind: 'load' | 'save' | 'recommend', work: (signal: AbortSignal) => Promise<Partial<typeof initial>>) {
    if (snapshot.busy) return;
    const version = ++revision;
    controller = new AbortController();
    const timeout = AbortSignal.timeout(35_000);
    update({ busy: kind, error: '', status: '', ...(kind === 'recommend' ? { result: null } : {}) });
    try {
      const result = await work(AbortSignal.any([controller.signal, timeout]));
      if (version === revision) update(result);
    } catch (error) {
      if (version === revision) update({ error: timeout.aborted ? '조회 시간이 길어졌어요. 인원을 줄이거나 잠시 후 다시 시도해 주세요.' : error instanceof Error ? error.message : '요청에 실패했어요.' });
    } finally { if (version === revision) update({ busy: '' }); }
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => snapshot, getServerSnapshot: () => initial,
    load: () => run('load', async signal => {
      const settings = await api.settings(signal);
      return { settings, taste: settings.taste, saved: settings.taste, selected: settings.members.filter(member => member.own).slice(0, 1).map(member => member.steamId) };
    }),
    setKind(kind: 'personal' | 'group') { if (!snapshot.busy) update({ kind, result: null, error: '', selected: kind === 'personal' ? snapshot.settings?.members.filter(member => member.own).slice(0, 1).map(member => member.steamId) ?? [] : snapshot.selected }); },
    setSelected(selected: string[]) { if (!snapshot.busy) update({ selected, result: null, error: '' }); },
    setScope(scope: typeof initial.scope) { if (!snapshot.busy) update({ scope, result: null }); },
    setSolo(solo: boolean) { if (!snapshot.busy) update({ solo, result: null }); },
    setTaste(taste: GameTaste) { if (!snapshot.busy) update({ taste, result: null, status: '', error: '' }); },
    save: () => run('save', async signal => {
      const result = await api.save(snapshot.taste, signal);
      return { taste: result.taste, saved: result.taste, result: null, status: '게임 취향을 저장했어요. 다음 추천부터 반영해요.' };
    }),
    clear: () => run('save', async signal => {
      await api.clear(signal);
      return { taste: emptyTaste(), saved: emptyTaste(), result: null, status: '게임 취향과 직접 남긴 함께한 기록을 지웠어요.' };
    }),
    recommend: () => run('recommend', async signal => {
      const result = await api.recommend({ kind: snapshot.kind, ids: [...snapshot.selected], scope: snapshot.scope, solo: snapshot.solo }, signal);
      return { result };
    }),
    cancel() { revision++; controller?.abort(); update({ busy: '' }); },
  };
}
