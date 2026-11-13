import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: async () => async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); } }));

describe('failure-stats', () => {
  const env = { DATABASE_URL: 'postgres://x' };
  afterEach(async () => (await import('./failure-stats')).resetFailureCountPause());

  it('skips database.* operations and environments without a database', async () => {
    const { shouldCount } = await import('./failure-stats');
    expect(shouldCount('database.query', Date.now(), env)).toBe(false);
    expect(shouldCount('steam.taste.GET', Date.now(), {})).toBe(false);
    expect(shouldCount('steam.taste.GET', Date.now(), env)).toBe(true);
  });

  it('pauses counting for 60 seconds after a failed write instead of reporting it again', async () => {
    const { shouldCount, writeFailureCount } = await import('./failure-stats');
    const error = vi.spyOn(console, 'error');
    await expect(writeFailureCount('steam.taste.GET', 'unexpected')).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
    expect(shouldCount('steam.taste.GET', Date.now(), env)).toBe(false);
    expect(shouldCount('steam.taste.GET', Date.now() + 60_001, env)).toBe(true);
  });
});
