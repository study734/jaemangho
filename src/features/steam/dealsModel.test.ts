import { expect, it, vi } from 'vitest';
import type { DealsResult } from './api';
import { createDealsModel } from './dealsModel';

const result = (name: string): DealsResult => ({ deals: [{ appId: 1, name, price: null, missingIds: ['a'] }], excluded: [], alreadyOwned: 0, pricesUnavailable: false });
const ids = ['a', 'b'];

it('늦게 도착한 이전 응답이 최신 결과를 덮어쓰지 않는다', async () => {
  const done: Array<(value: DealsResult) => void> = [];
  const api = { deals: vi.fn(() => new Promise<DealsResult>(resolve => { done.push(resolve); })) };
  const model = createDealsModel(api, ids);
  const first = model.load(), second = model.load();
  done[1](result('new')); await second;
  done[0](result('old')); await first;
  expect(model.getSnapshot()).toMatchObject({ loading: false, error: null, data: { deals: [{ name: 'new' }] } });
});

it('실패는 오류로 남기고 재시도하면 지운다. 2명 미만은 호출하지 않는다', async () => {
  const api = { deals: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(result('ok')) };
  const model = createDealsModel(api, ids);
  await model.load();
  expect(model.getSnapshot().error).toBeTruthy(); expect(model.getSnapshot().data).toBeNull();
  await model.load();
  expect(model.getSnapshot()).toMatchObject({ error: null, data: { deals: [{ name: 'ok' }] } });
  await createDealsModel(api, ['a']).load(); expect(api.deals).toHaveBeenCalledTimes(2);
});
