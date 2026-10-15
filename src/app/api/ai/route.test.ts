import { beforeEach, describe, expect, it, vi } from 'vitest';
const { requireUser, analyze } = vi.hoisted(() => ({ requireUser: vi.fn(), analyze: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireUser }));
vi.mock('@/server/ai/service', () => ({ analyze }));
vi.mock('@/server/ai/input', () => import('../../../server/ai/input'));
vi.mock('@/server/ai/client', () => import('../../../server/ai/client'));
vi.mock('@/server/http', () => import('../../../server/http'));
vi.mock('@/server/diagnostics', () => import('../../../server/diagnostics'));
import { POST } from './route';
import { AiError } from '../../../server/ai/client';
const request = () => new Request('https://example.com/api/ai', { method: 'POST', body: JSON.stringify({ context: { topic: 'general' } }) });
describe('AI authenticated boundary', () => {
  beforeEach(() => { vi.resetAllMocks(); requireUser.mockResolvedValue({ id: 'user' }); });
  it.each([401, 403])('preserves denied access %i without parsing or provider calls', async status => {
    const denied = new Response(null, { status });
    requireUser.mockResolvedValue(denied);
    expect(await POST(request())).toBe(denied);
    expect(analyze).not.toHaveBeenCalled();
  });
  it('uses the authenticated user for request sharing', async () => {
    analyze.mockResolvedValue({ answer: '답변', model: 'test', truncated: false });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(analyze).toHaveBeenCalledExactlyOnceWith('user', { context: { topic: 'general' }, question: '', history: [] });
  });
  it('returns recoverable errors with safe diagnostics and IDs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      analyze.mockRejectedValue(new AiError('upstream', 502, 'AI 인증 실패', 401));
      const response = await POST(request());
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body.requestId).toBe(response.headers.get('X-Request-ID'));
      expect(log).toHaveBeenCalledWith('[failure]', expect.objectContaining({ operation: 'api/ai.POST', cause: { code: 'http_401', status: 401 } }));
    } finally { log.mockRestore(); }
  });
});
