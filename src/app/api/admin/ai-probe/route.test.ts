import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireAdmin: fakes.admin }));
import { GET } from './route';

beforeEach(() => { vi.clearAllMocks(); fakes.admin.mockResolvedValue({ id: 'admin' }); vi.stubEnv('NVIDIA_API_KEY', 'private-key'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('admin AI timing probe', () => {
  it('stays behind the admin check and never calls the provider otherwise', async () => {
    const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    for (const status of [401, 403]) {
      fakes.admin.mockResolvedValue(new Response(null, { status }));
      expect((await GET()).status).toBe(status);
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it('returns only timings and statuses and keeps going after a failed call', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockRejectedValueOnce(Object.assign(new Error('private detail'), { name: 'TimeoutError' }))
      .mockResolvedValue(Response.json({ choices: [{ message: { content: 'private answer' } }] }));
    vi.stubGlobal('fetch', transport);
    const body = await (await GET()).json();
    expect(body.results).toHaveLength(4);
    expect(body.results[0].at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(body.results[0]).toMatchObject({ status: 200, headersMs: expect.any(Number) });
    expect(body.results[1]).toMatchObject({ status: null, error: 'TimeoutError' });
    expect(JSON.stringify(body)).not.toMatch(/private/);
    expect(transport.mock.calls.every(([, init]) => (init as RequestInit).headers && (init as { cache: string }).cache === 'no-store')).toBe(true);
  });
  it('reports a missing key without calling the provider', async () => {
    vi.stubEnv('NVIDIA_API_KEY', ''); const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    expect((await GET()).status).toBe(503); expect(transport).not.toHaveBeenCalled();
  });
});
