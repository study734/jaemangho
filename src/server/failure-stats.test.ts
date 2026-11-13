import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: unknown[][] = [];
let fail = false;
vi.mock('./db', () => ({
  db: async () => async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    if (fail) throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' });
    return [];
  },
}));
vi.mock('@vercel/functions', () => ({ waitUntil: () => {} }));

describe('failure-stats', () => {
  const env = { DATABASE_URL: 'postgres://x' };
  beforeEach(() => { vi.stubEnv('DATABASE_URL', 'postgres://x'); vi.spyOn(Math, 'random').mockReturnValue(0.5); calls.length = 0; fail = false; });
  afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); (await import('./failure-stats')).resetFailureCountPause(); });

  it('skips database.* operations and environments without a database', async () => {
    const { shouldCount } = await import('./failure-stats');
    expect(shouldCount('database.query', Date.now(), env)).toBe(false);
    expect(shouldCount('steam.taste.GET', Date.now(), {})).toBe(false);
    expect(shouldCount('steam.taste.GET', Date.now(), env)).toBe(true);
  });

  it('merges a burst of failures into one write', async () => {
    const { countFailure, settleFailureCounts } = await import('./failure-stats');
    for (let i = 0; i < 20; i++) countFailure('steam.web-api', 'timeout');
    countFailure('home.feed', 'unexpected');
    await settleFailureCounts();
    expect(calls).toEqual([[['steam.web-api', 'home.feed'], ['timeout', 'unexpected'], [20, 1]]]);
  });

  it('pauses for 60 seconds after a failed write, drops the batch and does not log again', async () => {
    const { countFailure, settleFailureCounts, shouldCount } = await import('./failure-stats');
    const error = vi.spyOn(console, 'error');
    fail = true;
    countFailure('steam.taste.GET', 'unexpected');
    await settleFailureCounts();
    expect(error).not.toHaveBeenCalled();
    expect(shouldCount('steam.taste.GET', Date.now(), env)).toBe(false);
    expect(shouldCount('steam.taste.GET', Date.now() + 60_001, env)).toBe(true);
    countFailure('steam.taste.GET', 'unexpected'); // 중단 중에는 쓰지 않는다
    await settleFailureCounts();
    expect(calls).toHaveLength(1);
  });
});
