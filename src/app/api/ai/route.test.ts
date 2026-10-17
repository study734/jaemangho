import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireUser }));
vi.mock('@/server/ai-status', () => import('../../../server/ai-status'));
import { POST } from './route';

beforeEach(() => { requireUser.mockReset(); requireUser.mockResolvedValue({ id: 'user' }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('suspended AI boundary', () => {
  it.each([401, 403])('preserves denied access %i', async status => {
    const denied = new Response(null, { status });
    requireUser.mockResolvedValue(denied);
    expect(await POST()).toBe(denied);
  });
  it('never contacts a provider even when an old key remains', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'unused-test-key');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const log = vi.spyOn(console, 'error');
    try {
      const response = await POST();
      expect(response.status).toBe(410);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ code: 'ai_disabled', error: expect.stringContaining('운영을 중단') });
      expect(fetch).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
