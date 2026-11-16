import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as external } from './route';
import { GET as watchdog } from '../ops-watchdog/route';
import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { resumePendingChat } from '@/server/operations/jobs';
import { sendWeeklySummary } from '@/server/operations/weekly-summary';
import { reportFailure } from '@/server/diagnostics';

vi.mock('@/server/operations/monitor', () => ({ authorizeMonitor: vi.fn(), checkOperations: vi.fn() }));
vi.mock('@/server/http', () => ({ serverError: vi.fn() }));
vi.mock('@/server/operations/jobs', () => ({ resumePendingChat: vi.fn() }));
vi.mock('@/server/operations/weekly-summary', () => ({ sendWeeklySummary: vi.fn() }));
vi.mock('@/server/diagnostics', () => ({ reportFailure: vi.fn() }));

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
    expect(await (await watchdog(new Request('https://site.example/api/cron/ops-watchdog'))).json()).toEqual({ skipped: false, active: 1, weeklySummary: 'sent' });
    vi.mocked(sendWeeklySummary).mockRejectedValueOnce(new Error('private'));
    const response = await watchdog(new Request('https://site.example/api/cron/ops-watchdog'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: false, active: 1, weeklySummary: 'failed' });
    expect(reportFailure).toHaveBeenCalledWith('ops.weekly-summary', expect.any(Error));
  });
});
