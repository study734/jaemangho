import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';
import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { recordUsage } from '@/server/operations/usage';
vi.mock('@/server/operations/monitor', () => ({ authorizeMonitor: vi.fn(), checkOperations: vi.fn() }));
vi.mock('@/server/http', async () => ({ ...await import('../../../../server/http'), serverError: vi.fn() }));
vi.mock('@/server/operations/usage', async () => ({ ...await import('../../../../server/operations/usage'), recordUsage: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const request = (body: unknown) => new Request('https://site.example/api/cron/usage', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const report = () => { const at = new Date().toISOString(); return { at, sample: { at, periodStart: at, computeSeconds: 100, transferBytes: 200 }, errorCode: null }; };
it.each([['unauthorized', 401], ['unconfigured', 503]] as const)('%s 요청은 사용량을 기록하지 않는다', async (auth, status) => {
  vi.mocked(authorizeMonitor).mockReturnValue(auth);
  expect((await POST(request(report()))).status).toBe(status);
  expect(recordUsage).not.toHaveBeenCalled();
});
it('미래·오래된 샘플·추가 비밀 필드·잘못된 수치를 기록하지 않는다', async () => {
  vi.mocked(authorizeMonitor).mockReturnValue('ok');
  for (const body of [{ ...report(), at: '2020-01-01T00:00:00Z' }, { ...report(), at: '2099-01-01T00:00:00Z' }, { ...report(), token: 'private' }, { ...report(), sample: { ...report().sample, computeSeconds: -1 } }, { ...report(), sample: null }]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(recordUsage).not.toHaveBeenCalled();
});
it('인증·검증 후 보호 상태만 반환하고 일반 점검으로 알림을 갱신한다', async () => {
  vi.mocked(authorizeMonitor).mockReturnValue('ok');
  vi.mocked(recordUsage).mockResolvedValue({ mode: 'limited', sample: null, checkedAt: null, errorCode: null, stale: false });
  const response = await POST(request(report()));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ mode: 'limited' });
  expect(checkOperations).toHaveBeenCalledWith('watchdog');
});
