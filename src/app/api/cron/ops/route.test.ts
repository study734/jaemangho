import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as external } from './route';
import { GET as watchdog } from '../ops-watchdog/route';
import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';

vi.mock('@/server/operations/monitor', () => ({ authorizeMonitor: vi.fn(), checkOperations: vi.fn() }));
vi.mock('@/server/http', () => ({ serverError: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe.each([['external', external], ['watchdog', watchdog]] as const)('%s 점검 라우트', (source, handler) => {
  it.each([['unconfigured', 503], ['unauthorized', 401]] as const)('인증 실패 %s에는 점검하지 않는다', async (auth, status) => {
    vi.mocked(authorizeMonitor).mockReturnValue(auth);
    const response = await handler(new Request('https://site.example/api/cron/ops'));
    expect(response.status).toBe(status);
    expect(checkOperations).not.toHaveBeenCalled();
  });
  it('기존 인증 헤더를 검사하고 점검 출처를 구분한다', async () => {
    vi.mocked(authorizeMonitor).mockReturnValue('ok');
    vi.mocked(checkOperations).mockResolvedValue({ skipped: false, active: 0 });
    const response = await handler(new Request('https://site.example/api/cron/ops', { headers: { Authorization: 'Bearer test' } }));
    expect(authorizeMonitor).toHaveBeenCalledWith('Bearer test');
    expect(checkOperations).toHaveBeenCalledWith(source);
    expect(await response.json()).toEqual({ skipped: false, active: 0 });
  });
});
