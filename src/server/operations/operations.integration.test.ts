import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('운영 기능 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let audit: typeof import('./audit');
  let jobs: typeof import('./jobs');
  let monitor: typeof import('./monitor');
  let analytics: typeof import('../analytics');
  const cleanup = async () => {
    await pool.query(`delete from ops_audit where actor_id = 'tops_admin'`);
    await pool.query(`delete from ops_jobs where job = 'chat'`);
    await pool.query(`delete from ops_alerts`);
    await pool.query(`delete from page_views where path = '/tops'`);
  };
  beforeAll(async () => {
    pool = await openTestDb();
    [audit, jobs, monitor, analytics] = await Promise.all([import('./audit'), import('./jobs'), import('./monitor'), import('../analytics')]);
    await cleanup();
  });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('성공·실패 작업 이력이 남고 비밀값은 기록하지 않는다', async () => {
    const actor = { id: 'tops_admin', name: '운영자' };
    expect(await audit.audited(actor, 'test.success', 'test', async () => 42)).toBe(42);
    await expect(audit.audited(actor, 'test.fail', 'test', async () => { throw new Error('do-not-store-secret'); })).rejects.toThrow();
    const rows = (await pool.query(`select action, result, finished_at from ops_audit where actor_id = 'tops_admin' order by id`)).rows;
    expect(rows.map((r) => r.result)).toEqual(['success', 'failed']);
    expect(rows.every((r) => r.finished_at)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('do-not-store-secret');
  });

  const fakeDiscord = async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('/guilds/') ? [{ id: 'tops_channel', name: '⛵ 테스트', type: 0 }] : []));
  it('중복 동기화를 거부하고 전체 성공 시각을 남긴다', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const fetchFn = async (url: string | URL | Request) => { started(); await gate; return fakeDiscord(url); };
    const options = { token: 'test', guildId: 'test', fetchFn };
    const first = jobs.runChatSync('manual', options);
    await ready;
    try { await expect(jobs.runChatSync('manual', options)).rejects.toBeInstanceOf(jobs.SyncBusyError); }
    finally { release(); }
    expect((await first).status).toBe('success');
    expect((await pool.query(`select count(*)::int as n from ops_jobs where status = 'success'`)).rows[0].n).toBe(1);
  });

  it('중단된 실행을 복구하고 대상 채널 없음은 부분 완료로 남긴다', async () => {
    await pool.query(`insert into ops_jobs (id, job, source, status, started_at) values ('tops_stale', 'chat', 'manual', 'running', now() - interval '10 minutes')`);
    const result = await jobs.runChatSync('scheduled', { token: 'test', guildId: 'test', fetchFn: async () => new Response('[]') });
    expect(result.status).toBe('partial');
    expect((await pool.query(`select status, error_code from ops_jobs where id = 'tops_stale'`)).rows[0]).toEqual({ status: 'failed', error_code: 'interrupted' });
  });

  it('같은 장애를 반복 통지하지 않고 복구 전환을 재시도할 수 있다', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://discord.com/api/webhooks/123456789012345678/test-token');
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchFn);
    try {
      await monitor.checkOperations();
      const sends = fetchFn.mock.calls.length;
      expect(sends).toBeGreaterThan(0);
      await monitor.checkOperations();
      expect(fetchFn).toHaveBeenCalledTimes(sends);
      // 설정 오류가 해결된 전환을 시뮬레이션한다. 부분 완료 채팅 알림은 봇 미설정이면 활성화되지 않는다.
      vi.stubEnv('SESSION_SECRET', 'test-secret-at-least-32-characters-long');
      vi.stubEnv('DISCORD_CLIENT_ID', '123456789012345678');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'test');
      vi.stubEnv('DISCORD_GUILD_ID', '123456789012345678');
      vi.stubEnv('RIOT_API_KEY', 'RGAPI-test');
      await pool.query(`update ops_alerts set notified_at = now() - interval '16 minutes'`);
      fetchFn.mockResolvedValueOnce(new Response(null, { status: 503 }));
      await monitor.checkOperations();
      expect((await pool.query(`select active, notification_error from ops_alerts where key = 'configuration'`)).rows[0]).toEqual({ active: false, notification_error: 'delivery_failed' });
      await pool.query(`update ops_alerts set notified_at = now() - interval '16 minutes'`);
      await monitor.checkOperations();
      expect((await pool.query(`select notified_state, notification_error from ops_alerts where key = 'configuration'`)).rows[0]).toEqual({ notified_state: false, notification_error: null });
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

  it('기간 합계·이전 기간 비교와 열람 없는 날을 포함한 일별 추이를 제공한다', async () => {
    await pool.query(`insert into page_views (day, path, views) values ('2026-10-06', '/tops', 3), ('2026-10-05', '/tops', 2), ('2026-09-29', '/tops', 7)`);
    const report = await analytics.viewReport(7, '2026-10-06');
    expect(report).toMatchObject({ start: '2026-09-30', end: '2026-10-06', previousStart: '2026-09-23', previousEnd: '2026-09-29' });
    expect(report.summary.find((s) => s.path === '/tops')).toEqual({ path: '/tops', current: 5, previous: 7 });
    expect(report.daily).toHaveLength(7);
    expect(report.daily.find((d) => d.day === '2026-10-05')?.views).toBeGreaterThanOrEqual(2);
    expect(analytics.viewReportSchema.safeParse({ days: '8' }).success).toBe(false);
    expect(analytics.viewReportSchema.safeParse({ end: '2026-02-31' }).success).toBe(false);
  });
});
