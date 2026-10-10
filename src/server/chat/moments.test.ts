import { beforeEach, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../db', () => ({ db: async () => query }));

import { getFunniestMessages } from './moments';

beforeEach(() => query.mockClear());

it('웃음 기록이 없으면 메시지별 2분 조회를 시작하지 않는다', async () => {
  expect(await getFunniestMessages()).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
});
