import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createScratchDb, openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('주간 운영 요약 (DB)', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDb>>;
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let summary: typeof import('./weekly-summary');
  const monday = Date.parse('2026-11-16T03:00:00Z'); // 월 12시 KST → 11/9~11/15 주
  beforeAll(async () => {
    // 운영 표를 비우고 넣으므로 다른 테스트와 DB를 분리한다.
    scratch = await createScratchDb();
    pool = await openTestDb(scratch.url);
    summary = await import('./weekly-summary');
  });
  afterAll(async () => { if (pool) await pool.end(); if (scratch) await scratch.drop(); });

  it('볼 것이 없는 주는 보내지 않고 같은 주를 다시 처리하지 않는다', async () => {
    // 사용량 보고가 없으면 '확인 불가'를 알리므로, 정상 사용량(현재 1%) 보고를 넣어 둔다.
    const at = new Date().toISOString(), periodStart = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await pool.query(`insert into ops_usage (id, checked_at, sample, error_code, mode) values (1, $1, $2::jsonb, null, 'normal')`,
      [at, JSON.stringify({ at, periodStart, computeSeconds: 3600, transferBytes: 1e7 })]);
    const send = vi.fn();
    expect(await summary.sendWeeklySummary(monday, send)).toBe('quiet');
    expect(await summary.sendWeeklySummary(monday + 86_400_000, send)).toBe('already_handled');
    expect(send).not.toHaveBeenCalled();
    expect((await pool.query(`select week::text, status from ops_weekly_summaries`)).rows).toEqual([{ week: '2026-11-09', status: 'quiet' }]);
  });

  it('지난주 기록만 모으고, 전송 실패면 다음 날 다시 보내며 성공한 주는 한 번만 보낸다', async () => {
    const next = monday + 7 * 86_400_000; // 11/16~11/22 주
    await pool.query(`delete from ops_usage`);
    await pool.query(`insert into app_failures (day, operation, code, count) values
      ('2026-11-17', 'db.connect-retry', 'recovered', 3), ('2026-11-18', 'api/steam.GET', 'timeout', 2),
      ('2026-11-23', 'api/steam.GET', 'timeout', 50), ('2026-11-15', 'api/steam.GET', 'timeout', 40)`); // 앞뒤 주는 제외
    await pool.query(`insert into ops_alerts (key, title, severity, active, first_seen, resolved_at) values
      ('chat.failed', '채팅 실패', 'critical', false, '2026-11-18T01:00:00Z', '2026-11-18T05:00:00Z'),
      ('riot.auth', 'Riot 키 오류', 'warning', true, '2026-11-10T01:00:00Z', null)`);
    await pool.query(`insert into ops_jobs (id, job, source, status, started_at) values ('tw1', 'chat', 'scheduled', 'failed', '2026-11-19T10:00:00Z')`);
    await pool.query(`insert into ops_audit (actor_id, actor_name, action, target, result, created_at) values ('a', '운영자', 'cache.clear', 'steam', 'success', '2026-11-20T10:00:00Z')`);

    const failing = vi.fn().mockResolvedValue('delivery_failed');
    expect(await summary.sendWeeklySummary(next, failing)).toBe('delivery_failed');
    const send = vi.fn().mockResolvedValue('sent');
    expect(await summary.sendWeeklySummary(next + 86_400_000, send)).toBe('sent');
    expect(await summary.sendWeeklySummary(next + 2 * 86_400_000, send)).toBe('already_handled');
    expect(send).toHaveBeenCalledOnce();
    const text = send.mock.calls[0][0] as string;
    expect(text).toContain('[재망호 주간 요약] 11/16–11/22');
    expect(text).toContain('Neon 사용량 확인 불가'); // 이 DB에는 사용량 보고가 없다
    expect(text).toContain('다시 시도로 회복 3회');
    expect(text).toContain('새 경고 1건: 긴급 채팅 실패');
    expect(text).toContain('해소 1건');
    expect(text).toContain('아직 진행 중 1건: Riot 키 오류');
    expect(text).toContain('서버 실패 2회: api/steam.GET(timeout) 2');
    expect(text).toContain('채팅 동기화 실패 1회');
    expect(text).toContain('관리자 수동 작업 1회');
    expect((await pool.query(`select status from ops_weekly_summaries where week = '2026-11-16'`)).rows).toEqual([{ status: 'sent' }]);
  });

  it('처리 중(pending)으로 1시간 넘게 남은 주만 다시 선점한다', async () => {
    const week = monday + 14 * 86_400_000; // 11/23~11/29 주
    await pool.query(`insert into ops_weekly_summaries (week, status, updated_at) values ('2026-11-23', 'pending', now() - interval '10 minutes')`);
    const send = vi.fn().mockResolvedValue('sent');
    expect(await summary.sendWeeklySummary(week, send)).toBe('already_handled');
    await pool.query(`update ops_weekly_summaries set updated_at = now() - interval '2 hours' where week = '2026-11-23'`);
    expect(await summary.sendWeeklySummary(week, send)).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
  });
});
