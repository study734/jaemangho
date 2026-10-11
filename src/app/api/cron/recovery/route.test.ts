import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';
import { authorizeMonitor } from '@/server/operations/monitor';
import { runChatRecovery } from '@/server/operations/jobs';
vi.mock('@/server/operations/monitor', () => ({ authorizeMonitor: vi.fn() }));
vi.mock('@/server/http', () => ({ serverError: vi.fn() }));
vi.mock('@/server/operations/jobs', () => ({ runChatRecovery: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it.each([['unconfigured', 503], ['unauthorized', 401]] as const)('%s에는 복구를 실행하지 않는다', async (auth, status) => {
  vi.mocked(authorizeMonitor).mockReturnValue(auth);
  expect((await GET(new Request('https://site.example/api/cron/recovery'))).status).toBe(status);
  expect(runChatRecovery).not.toHaveBeenCalled();
});
it('인증 후 복구 상태만 반환하고 점검은 다른 요청으로 분리한다', async () => {
  vi.mocked(authorizeMonitor).mockReturnValue('ok');
  vi.mocked(runChatRecovery).mockResolvedValue('waiting');
  const response = await GET(new Request('https://site.example/api/cron/recovery', { headers: { Authorization: 'Bearer test' } }));
  expect(authorizeMonitor).toHaveBeenCalledWith('Bearer test');
  expect(await response.json()).toEqual({ recovery: 'waiting' });
});
