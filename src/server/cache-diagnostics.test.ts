import { afterEach, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('./db', () => ({ db: async () => query }));
import { cacheGet, cachePut, bumpStat, logRiotError } from './riot/cache';
import { steamCacheGet, steamCachePut, steamStat } from './steam/cache';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); query.mockReset(); });

it('캐시·통계 기록 실패는 요청을 막지 않으면서 작업과 DB 원인을 남긴다', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://fixture');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  query.mockRejectedValue(Object.assign(new Error('private SQL parameters'), { code: '42P01' }));
  await expect(cacheGet('private-member')).resolves.toBeNull();
  await expect(steamCacheGet('private-member')).resolves.toBeUndefined();
  await cachePut('private-member', 200, {}, 10); await steamCachePut('private-member', {}, 10);
  await bumpStat('hit'); await logRiotError(503, 'private-path'); await steamStat('error', 'private-path', 'network');
  expect(log.mock.calls.map(([, data]) => data.operation)).toEqual([
    'riot.cache.read', 'steam.cache.read', 'riot.cache.write', 'steam.cache.write', 'riot.statistics.write', 'riot.errors.write', 'steam.statistics.write',
  ]);
  expect(log.mock.calls.every(([, data]) => data.code === '42P01')).toBe(true);
  expect(JSON.stringify(log.mock.calls)).not.toContain('private');
});

it('캐시 실패 후 다음 요청은 정상 응답으로 복구한다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  query.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 'ECONNREFUSED' }))
    .mockResolvedValueOnce([{ status: 200, body: { ok: true } }]);
  expect(await cacheGet('key')).toBeNull();
  expect(await cacheGet('key')).toEqual({ status: 200, body: { ok: true } });
});
