import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as external } from './route';
import { GET as watchdog } from '../ops-watchdog/route';
import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { resumePendingChat } from '@/server/operations/jobs';
import { sendWeeklySummary } from '@/server/operations/weekly-summary';
import { reportFailure } from '@/server/diagnostics';
import { runSteamCollection, SteamCollectionBudgetError, SteamCollectionBusyError } from '@/server/activity/steam-collection';

vi.mock('@/server/operations/monitor', () => ({ authorizeMonitor: vi.fn(), checkOperations: vi.fn() }));
vi.mock('@/server/http', () => ({ serverError: vi.fn() }));
vi.mock('@/server/operations/jobs', () => ({ resumePendingChat: vi.fn() }));
vi.mock('@/server/operations/weekly-summary', () => ({ sendWeeklySummary: vi.fn() }));
vi.mock('@/server/diagnostics', () => ({ reportFailure: vi.fn() }));
vi.mock('@/server/activity/steam-collection', () => ({
  runSteamCollection: vi.fn(), SteamCollectionBudgetError: class extends Error {}, SteamCollectionBusyError: class extends Error {},
}));

beforeEach(() => vi.resetAllMocks());

describe.each([['external', external], ['watchdog', watchdog]] as const)('%s 점검 라우트', (source, handler) => {
  it.each([['unconfigured', 503], ['unauthorized', 401]] as const)('인증 실패 %s에는 점검하지 않는다', async (auth, status) => {
    vi.mocked(authorizeMonitor).mockReturnValue(auth);
    const response = await handler(new Request('https://site.example/api/cron/ops'));
    expect(response.status).toBe(status);
    expect(checkOperations).not.toHaveBeenCalled();
    expect(resumePendingChat).not.toHaveBeenCalled();
  });
  it('기존 인증 헤더를 검사하고 점검 출처를 구분한다', async () => {
    vi.mocked(authorizeMonitor).mockReturnValue('ok');
    vi.mocked(checkOperations).mockResolvedValue({ skipped: false, active: 0 });
    vi.mocked(resumePendingChat).mockResolvedValue('not_needed');
    vi.mocked(sendWeeklySummary).mockResolvedValue('quiet');
    const response = await handler(new Request('https://site.example/api/cron/ops', { headers: { Authorization: 'Bearer test' } }));
    expect(authorizeMonitor).toHaveBeenCalledWith('Bearer test');
    expect(checkOperations).toHaveBeenCalledWith(source);
    expect(await response.json()).toMatchObject({ skipped: false, active: 0 });
    expect(resumePendingChat).not.toHaveBeenCalled();
    expect(sendWeeklySummary).toHaveBeenCalledTimes(source === 'watchdog' ? 1 : 0);
  });
});

describe('보조 점검의 주간 요약', () => {
  it('요약 결과를 함께 돌려주고, 요약이 실패해도 점검 결과는 그대로 응답한다', async () => {
    vi.mocked(authorizeMonitor).mockReturnValue('ok');
    vi.mocked(checkOperations).mockResolvedValue({ skipped: false, active: 1 });
    vi.mocked(sendWeeklySummary).mockResolvedValueOnce('sent');
    expect(await (await watchdog(new Request('https://site.example/api/cron/ops-watchdog'))).json()).toMatchObject({ skipped: false, active: 1, weeklySummary: 'sent' });
    vi.mocked(sendWeeklySummary).mockRejectedValueOnce(new Error('private'));
    const response = await watchdog(new Request('https://site.example/api/cron/ops-watchdog'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: false, active: 1, weeklySummary: 'failed' });
    expect(reportFailure).toHaveBeenCalledWith('ops.weekly-summary', expect.any(Error));
  });
});

describe('보조 점검의 Steam 예약 수집 (intent/0001 R1·R3·R4·R5)', () => {
  const run = async () => watchdog(new Request('https://site.example/api/cron/ops-watchdog'));
  beforeEach(() => {
    vi.mocked(authorizeMonitor).mockReturnValue('ok');
    vi.mocked(checkOperations).mockResolvedValue({ skipped: false, active: 0 });
    vi.mocked(sendWeeklySummary).mockResolvedValue('quiet');
  });
  it('점검이 끝난 뒤 25초 예산으로 예약 수집을 한 번 실행하고 개수만 응답한다', async () => {
    const order: string[] = [];
    vi.mocked(checkOperations).mockImplementation(async () => { order.push('check'); return { skipped: false, active: 0 }; });
    vi.mocked(runSteamCollection).mockImplementation(async () => {
      order.push('steam');
      return { id: '00000000-0000-0000-0000-000000000001', status: 'partial', eligible: 3, collected: 2, unavailable: 0, failed: 0, changes: 5, deferred: 1 };
    });
    const body = await (await run()).json();
    expect(order).toEqual(['check', 'steam']);
    expect(runSteamCollection).toHaveBeenCalledTimes(1);
    expect(runSteamCollection).toHaveBeenCalledWith('scheduled', { budgetMs: 25_000 });
    expect(body.steamActivity).toEqual({ status: 'partial', eligible: 3, collected: 2, unavailable: 0, failed: 0, changes: 5, deferred: 1 });
  });
  it('무료 사용량으로 막히거나 실행 중이면 상태만 알리고, 실패해도 점검 응답은 그대로다', async () => {
    vi.mocked(runSteamCollection).mockRejectedValueOnce(new SteamCollectionBudgetError());
    expect((await (await run()).json()).steamActivity).toBe('budget');
    vi.mocked(runSteamCollection).mockRejectedValueOnce(new SteamCollectionBusyError());
    expect((await (await run()).json()).steamActivity).toBe('busy');
    expect(reportFailure).not.toHaveBeenCalled();
    vi.mocked(runSteamCollection).mockRejectedValueOnce(new Error('steam-key-leak'));
    const response = await run();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ skipped: false, active: 0, weeklySummary: 'quiet', steamActivity: 'failed' });
    expect(JSON.stringify(body)).not.toContain('steam-key-leak');
    expect(reportFailure).toHaveBeenCalledWith('steam.activity.scheduled', expect.any(Error));
  });
  it('외부 점검 경로(/api/cron/ops)는 수집하지 않는다', async () => {
    vi.mocked(resumePendingChat).mockResolvedValue('not_needed');
    await external(new Request('https://site.example/api/cron/ops'));
    expect(runSteamCollection).not.toHaveBeenCalled();
  });
});
