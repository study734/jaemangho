import { beforeEach, describe, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ requireUser: vi.fn(), choices: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireUser: fakes.requireUser }));
vi.mock('@/server/ai/tools', () => ({ memberChoices: fakes.choices }));
vi.mock('@/server/ai/store', () => ({ readPreference: fakes.read, savePreference: fakes.save }));
vi.mock('@/server/ai/input', () => import('../../../../server/ai/input'));
vi.mock('@/server/ai/client', () => import('../../../../server/ai/client'));
vi.mock('@/server/http', () => import('../../../../server/http'));
vi.mock('@/server/diagnostics', () => import('../../../../server/diagnostics'));
import { GET, PUT } from './route';
const request = (body: unknown, origin = 'https://example.com') => new Request('https://example.com/api/ai/settings', { method: 'PUT', headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); fakes.requireUser.mockResolvedValue({ id: 'authenticated-user' });
  fakes.read.mockResolvedValue('저장한 취향'); fakes.choices.mockResolvedValue({ steam: [], lol: [] });
});
describe('private agent settings', () => {
  it('uses only the authenticated user for loading and saving', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ note: '저장한 취향' });
    await PUT(request({ userId: 'other-user', note: '새 취향' }));
    expect(fakes.read).toHaveBeenCalledWith('authenticated-user');
    expect(fakes.save).toHaveBeenCalledExactlyOnceWith('authenticated-user', '새 취향');
  });
  it('preserves login and blocked-user denial before data access', async () => {
    for (const status of [401, 403]) {
      fakes.requireUser.mockResolvedValue(new Response(null, { status }));
      expect((await GET()).status).toBe(status);
      expect((await PUT(request({ note: 'x' }))).status).toBe(status);
    }
    expect(fakes.read).not.toHaveBeenCalled(); expect(fakes.save).not.toHaveBeenCalled();
  });
  it('rejects cross-site writes, oversized chunked input and long notes', async () => {
    expect((await PUT(request({ note: 'x' }, 'https://other.example'))).status).toBe(403);
    expect((await PUT(request({ note: 'x'.repeat(401) }))).status).toBe(400);
    expect((await PUT(request({ note: 'x'.repeat(5000) }))).status).toBe(413);
    expect(fakes.save).not.toHaveBeenCalled();
  });
});
