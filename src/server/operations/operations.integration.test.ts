import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createScratchDb, openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('운영 기능 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let audit: typeof import('./audit');
  let jobs: typeof import('./jobs');
  let monitor: typeof import('./monitor');
  let analytics: typeof import('../analytics');
  let scratch: Awaited<ReturnType<typeof createScratchDb>>;
  const cleanup = async () => {
    await pool.query(`delete from ops_audit where actor_id = 'tops_admin'`);
    await pool.query(`delete from ops_jobs where job = 'chat'`);
    await pool.query(`delete from ops_alerts`);
    await pool.query(`delete from ops_monitor`);
    await pool.query(`delete from riot_errors where path = 'tops_monitor'`);
    await pool.query(`delete from steam_errors where endpoint = 'tops_monitor'`);
    await pool.query(`delete from page_views where path = '/tops'`);
  };
  beforeAll(async () => {
    // 전체 오류 구간을 읽으므로 다른 테스트의 오류 쓰기와 DB를 분리한다.
    scratch = await createScratchDb();
    pool = await openTestDb(scratch.url);
    [audit, jobs, monitor, analytics] = await Promise.all([import('./audit'), import('./jobs'), import('./monitor'), import('../analytics')]);
    await cleanup();
  });
  afterAll(async () => { if (pool) { await cleanup(); await pool.end(); } if (scratch) await scratch.drop(); });

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
      fetchFn.mockResolvedValue(new Response(null, { status: 503 }));
      await monitor.checkOperations();
      expect((await pool.query(`select active, notification_error from ops_alerts where key = 'configuration'`)).rows[0]).toEqual({ active: false, notification_error: 'delivery_failed' });
      await pool.query(`update ops_alerts set notified_at = now() - interval '16 minutes'`);
      fetchFn.mockResolvedValue(new Response(null, { status: 204 }));
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

  it('다른 점검 트랜잭션이 실행 중이면 건너뛰고 종료 후에는 락이 남지 않는다', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock($1)', [727276]);
      expect(await monitor.checkOperations()).toMatchObject({ skipped: true });
    } finally { await client.query('rollback'); client.release(); }
    expect(await monitor.checkOperations()).toMatchObject({ skipped: false });
    expect((await pool.query(`select count(*)::int as n from pg_locks where locktype = 'advisory' and objid = 727276`)).rows[0].n).toBe(0);
  });

  it('30분보다 오래된 오류를 확인하고 처리한 구간과 미래 오류는 다시 포함하지 않는다', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '');
    try {
      await pool.query(`update ops_monitor set errors_checked_at = now() - interval '4 hours'`);
      await pool.query(`insert into riot_errors (at, status, path) values
        (now() - interval '2 hours', 403, 'tops_monitor'), (now() + interval '1 hour', 403, 'tops_monitor')`);
      await pool.query(`insert into steam_errors (at, endpoint, code)
        select now() - interval '2 hours', 'tops_monitor', 'upstream' from generate_series(1, 3)`);
      await monitor.checkOperations('external');
      expect((await pool.query(`select key from ops_alerts where active and key in ('riot.key', 'steam.upstream') order by key`)).rows)
        .toEqual([{ key: 'riot.key' }, { key: 'steam.upstream' }]);
      await monitor.checkOperations('external');
      expect((await pool.query(`select key from ops_alerts where active and key in ('riot.key', 'steam.upstream')`)).rows).toEqual([]);
    } finally {
      await pool.query(`delete from riot_errors where path = 'tops_monitor'`);
      await pool.query(`delete from steam_errors where endpoint = 'tops_monitor'`);
      vi.unstubAllEnvs();
    }
  });

  it('보조·수동 점검은 외부 성공 시각을 가리지 않고 외부 성공은 누락 상태를 해소한다', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '');
    try {
      await pool.query(`update ops_monitor set external_checked_at = now() - interval '4 hours'`);
      const before = (await pool.query(`select external_checked_at from ops_monitor`)).rows[0].external_checked_at;
      await monitor.checkOperations('watchdog');
      await monitor.checkOperations();
      expect((await pool.query(`select external_checked_at from ops_monitor`)).rows[0].external_checked_at).toEqual(before);
      expect((await pool.query(`select active from ops_alerts where key = 'monitor.stale'`)).rows[0].active).toBe(true);
      await monitor.checkOperations('external');
      expect((await pool.query(`select active from ops_alerts where key = 'monitor.stale'`)).rows[0].active).toBe(false);
      expect((await pool.query(`select external_checked_at > $1 as newer from ops_monitor`, [before])).rows[0].newer).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });

  it('첫 적용은 이전 버전의 최근 점검 기록과 관계없이 보관된 오류를 확인한다', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '');
    try {
      await pool.query(`update ops_monitor set checked_at = now(), errors_checked_at = null`);
      await pool.query(`insert into riot_errors (at, status, path) values (now() - interval '2 hours', 403, 'tops_monitor')`);
      await monitor.checkOperations('external');
      expect((await pool.query(`select active from ops_alerts where key = 'riot.key'`)).rows[0].active).toBe(true);
    } finally {
      await pool.query(`delete from riot_errors where path = 'tops_monitor'`);
      vi.unstubAllEnvs();
    }
  });

  it('실행 도중 생긴 오류와 알림 전송 실패를 다음 실행에서 놓치지 않는다', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://discord.com/api/webhooks/123456789012345678/test-token');
    let inserted = false;
    const fetchFn = vi.fn(async () => {
      if (!inserted) {
        inserted = true;
        await pool.query(`insert into riot_errors (status, path) values (403, 'tops_monitor')`);
      }
      return new Response(null, { status: 503 });
    });
    vi.stubGlobal('fetch', fetchFn);
    try {
      await pool.query(`update ops_alerts set notified_state = null, notified_at = null`);
      await monitor.checkOperations('external');
      expect(inserted).toBe(true);
      await monitor.checkOperations('external');
      expect((await pool.query(`select active, notification_error from ops_alerts where key = 'riot.key'`)).rows[0])
        .toEqual({ active: true, notification_error: 'delivery_failed' });
      await pool.query(`update ops_alerts set notified_at = now() - interval '16 minutes'`);
      fetchFn.mockImplementation(async () => new Response(null, { status: 204 }));
      await monitor.checkOperations('external');
      expect((await pool.query(`select active, notified_state, notification_error from ops_alerts where key = 'riot.key'`)).rows[0])
        .toEqual({ active: true, notified_state: true, notification_error: null });
      await monitor.checkOperations('external');
      expect((await pool.query(`select active from ops_alerts where key = 'riot.key'`)).rows[0].active).toBe(false);
    } finally {
      await pool.query(`delete from riot_errors where path = 'tops_monitor'`);
      vi.unstubAllGlobals(); vi.unstubAllEnvs();
    }
  });

  it('점검 완료 기록 저장이 실패하면 오류 구간과 외부 성공 시각을 전진시키지 않는다', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '');
    const before = (await pool.query(`select checked_at, errors_checked_at, external_checked_at from ops_monitor`)).rows[0];
    try {
      await pool.query(`create function tops_monitor_fail() returns trigger language plpgsql as $$ begin raise exception 'test monitor failure'; end $$`);
      await pool.query(`create trigger tops_monitor_fail before update on ops_monitor for each row execute function tops_monitor_fail()`);
      await expect(monitor.checkOperations('external')).rejects.toThrow('test monitor failure');
      expect((await pool.query(`select checked_at, errors_checked_at, external_checked_at from ops_monitor`)).rows[0]).toEqual(before);
    } finally {
      await pool.query(`drop trigger if exists tops_monitor_fail on ops_monitor`);
      await pool.query(`drop function if exists tops_monitor_fail()`);
      vi.unstubAllEnvs();
    }
  });
});
