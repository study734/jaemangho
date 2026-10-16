import { emptyTaste, type GameTaste, type TasteSettings } from './personalTypes';

async function json<T>(signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/steam/taste', { ...init, signal, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(typeof body?.error === 'string' ? body.error : '추천 데이터 요청을 완료하지 못했어요.');
  return body;
}
const tasteApi = {
  settings: (signal: AbortSignal) => json<TasteSettings>(signal),
  save: (taste: GameTaste, signal: AbortSignal) => json<{ taste: GameTaste }>(signal, { method: 'PUT', body: JSON.stringify(taste) }),
  clear: (signal: AbortSignal) => json(signal, { method: 'DELETE', body: '{}' }),
};

export function createTasteModel(api = tasteApi) {
  const initial = { settings: null as TasteSettings | null, taste: emptyTaste(), saved: emptyTaste(), busy: '', error: '', status: '' };
  let snapshot = initial, revision = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (change: Partial<typeof initial>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); };
  async function run(kind: string, work: (signal: AbortSignal) => Promise<Partial<typeof initial>>) {
    if (snapshot.busy) return;
    const version = ++revision;
    controller = new AbortController();
    update({ busy: kind, error: '', status: '' });
    try {
      const result = await work(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
      if (version === revision) update(result);
    } catch (error) {
      if (version === revision) update({ error: error instanceof Error ? error.message : '요청에 실패했어요.' });
    } finally { if (version === revision) update({ busy: '' }); }
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => snapshot, getServerSnapshot: () => initial,
    load: () => run('load', async signal => {
      const settings = await api.settings(signal);
      return { settings, taste: settings.taste, saved: settings.taste };
    }),
    setTaste(taste: GameTaste) { if (!snapshot.busy) update({ taste, status: '', error: '' }); },
    save: () => run('save', async signal => {
      const { taste } = await api.save(snapshot.taste, signal);
      return { taste, saved: taste, status: '게임 취향을 저장했어요. 다음 공통 추천부터 반영해요.' };
    }),
    clear: () => run('clear', async signal => {
      await api.clear(signal); return { taste: emptyTaste(), saved: emptyTaste(), status: '게임 취향을 지웠어요.' };
    }),
    cancel() { revision++; controller?.abort(); update({ busy: '' }); },
  };
}
