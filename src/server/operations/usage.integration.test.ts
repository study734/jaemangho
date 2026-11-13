import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createScratchDb, openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('실제 DB 사용량 보호', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDb>>;
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let usage: typeof import('./usage');
  let jobs: typeof import('./jobs');
  let timestamp = Date.now();
  const report = (hours: number, periodStart = '2026-10-03T00:00:00Z') => {
    const at = new Date(timestamp += 1000).toISOString();
    return { at, sample: { at, periodStart, computeSeconds: hours * 3600, transferBytes: 0 }, errorCode: null };
  };
  beforeAll(async () => {
    scratch = await createScratchDb();
    pool = await openTestDb(scratch.url);
    [usage, jobs] = await Promise.all([import('./usage'), import('./jobs')]);
  });
  afterAll(async () => { if (pool) await pool.end(); if (scratch) await scratch.drop(); });
  it('실패·과거 보고·기간 내 사용량 감소로 중단을 풀지 않고 새 기간에서 자동 재개한다', async () => {
    expect((await usage.recordUsage(report(91))).mode).toBe('paused');
    const failed = { at: new Date(timestamp += 1000).toISOString(), sample: null, errorCode: 'neon_unavailable' as const };
    expect((await usage.recordUsage(failed)).mode).toBe('paused');
    expect((await usage.usageStatus()).sample?.computeSeconds).toBe(91 * 3600);
    expect((await usage.recordUsage(report(1))).mode).toBe('paused');
    expect((await usage.usageStatus()).errorCode).toBe('neon_invalid');
    const resumed = report(1, '2026-10-11T00:00:00Z');
    expect((await usage.recordUsage(resumed)).mode).toBe('normal');
    await usage.recordUsage(failed);
    expect((await usage.usageStatus()).mode).toBe('normal');
    await pool.query('delete from ops_usage');
  });
  it('중단·감속을 실제 동기화 진입점에서 적용하며 수동 처리와 동시 실행 잠금은 유지한다', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes('/guilds/') ? [{ id: 'usage_channel', name: '⛵ 테스트', type: 0 }] : []));
    const options = { token: 'test', guildId: 'test', fetchFn };
    try {
      await usage.recordUsage(report(91));
      await expect(jobs.runChatSync('scheduled', options)).rejects.toBeInstanceOf(jobs.SyncBudgetError);
      expect(fetchFn).not.toHaveBeenCalled();
      expect((await jobs.runChatSync('manual', options)).status).toBe('success');
      await pool.query('delete from ops_usage');
      await usage.recordUsage(report(80));
      expect((await jobs.runChatSync('scheduled', options)).status).toBe('success');
      const calls = fetchFn.mock.calls.length;
      const results = await Promise.allSettled([jobs.runChatSync('scheduled', options), jobs.runChatSync('scheduled', options)]);
      expect(results.every(result => result.status === 'rejected' && result.reason instanceof jobs.SyncBudgetError)).toBe(true);
      expect(fetchFn).toHaveBeenCalledTimes(calls);
      await pool.query(`update ops_jobs set started_at = now() - interval '49 hours' where job = 'chat' and source = 'scheduled'`);
      expect((await jobs.runChatSync('scheduled', options)).status).toBe('success');
    } finally { await pool.query('delete from ops_usage'); await pool.query(`delete from ops_jobs`); }
  });
  it('회복 시도도 예산을 지키며 제한을 일반 실패·재시도 소진으로 기록하지 않는다', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', 'test');
    vi.stubEnv('DISCORD_GUILD_ID', 'test');
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    try {
      await usage.recordUsage(report(91));
      await pool.query(`insert into ops_jobs (id, job, source, status, started_at, finished_at, error_code)
        values ('usage_retry', 'chat', 'scheduled', 'failed', now() - interval '20 minutes', now() - interval '16 minutes', 'discord_timeout')`);
      expect(await jobs.resumePendingChat()).toBe('budget_paused');
      expect(fetchFn).not.toHaveBeenCalled();
      expect((await pool.query(`select count(*)::int as n from ops_jobs where job = 'chat'`)).rows[0].n).toBe(1);
      await pool.query(`update ops_usage set sample = jsonb_set(sample, '{at}', to_jsonb((now() - interval '25 hours')::text))`);
      expect((await usage.usageStatus()).mode).toBe('paused');
    } finally { await pool.query('delete from ops_usage'); await pool.query('delete from ops_jobs'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});
