import { expect, it, vi } from 'vitest';

vi.mock('@/server/pool', () => { throw new Error('Liveness must not initialize the DB'); });
import { GET } from './route';

it('DB 연결 없이 캐시되지 않는 실행 상태를 반환한다', async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, kind: 'liveness' });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
