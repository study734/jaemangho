import { steamErrorMessage, type steamApi, type DealsResult } from './api';

export interface DealsSnapshot { data: DealsResult | null; loading: boolean; error: string | null }

// 선택한 멤버 한 조합의 세일 조회. 멤버가 바뀌면 화면이 새 모델로 바꾸므로 조합은 모델 안에서 바뀌지 않는다.
// 같은 조합을 다시 조회하면 마지막 요청만 결과를 반영한다.
export function createDealsModel(api: Pick<typeof steamApi, 'deals'>, ids: string[]) {
  const initialSnapshot: DealsSnapshot = { data: null, loading: false, error: null };
  let snapshot = initialSnapshot;
  let latest = 0;
  const listeners = new Set<() => void>();
  const update = (change: Partial<DealsSnapshot>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      if (ids.length < 2) return;
      const request = ++latest;
      update({ loading: true, error: null });
      try {
        const data = await api.deals(ids);
        if (request === latest) update({ data });
      } catch (error) {
        if (request === latest) update({ error: steamErrorMessage(error) });
      } finally {
        if (request === latest) update({ loading: false });
      }
    },
  };
}
