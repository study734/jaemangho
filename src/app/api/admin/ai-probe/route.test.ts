import { beforeEach, describe, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ admin: vi.fn(), model: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireAdmin: fakes.admin }));
vi.mock('@/server/ai/client', async () => ({ ...await import('../../../../server/ai/client'), requestModel: fakes.model }));
vi.mock('@/server/ai/tools', () => ({ toolDefinitions: [] }));
vi.mock('@/server/ai/context', () => import('../../../../server/ai/context'));
import { AiError } from '../../../../server/ai/client';
import { GET } from './route';

beforeEach(() => { vi.clearAllMocks(); fakes.admin.mockResolvedValue({ id: 'admin' }); });
describe('admin AI timing probe', () => {
  it('stays behind the admin check and never calls the provider otherwise', async () => {
    for (const status of [401, 403]) {
      fakes.admin.mockResolvedValue(new Response(null, { status }));
      expect((await GET()).status).toBe(status);
    }
    expect(fakes.model).not.toHaveBeenCalled();
  });
  it('returns only timings and codes, distinguishing success from a timeout', async () => {
    fakes.model.mockImplementationOnce(async (_m: unknown, o: { onStage?: (s: 'modelbody') => void }) => { o.onStage?.('modelbody'); return {}; })
      .mockRejectedValueOnce(new AiError('timeout', 504, 'private text'));
    const body = await (await GET()).json();
    expect(body.results).toMatchObject([{ name: 'minimal', ok: true, headersMs: expect.any(Number) }, { name: 'full-with-tools', ok: false, headersMs: null, code: 'timeout', status: 504 }]);
    expect(JSON.stringify(body)).not.toContain('private text');
  });
});
