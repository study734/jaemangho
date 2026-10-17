import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireUser }));
vi.mock('@/server/ai-status', () => import('../../../../server/ai-status'));
import { GET, PUT } from './route';

beforeEach(() => { requireUser.mockReset(); requireUser.mockResolvedValue({ id: 'user' }); });
afterEach(() => { vi.unstubAllGlobals(); });

it.each([GET, PUT])('does not read or save preferences for a suspended feature', async handler => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const response = await handler();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ code: 'ai_disabled' });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([401, 403])('preserves login and blocked-user denial %i', async status => {
  const denied = new Response(null, { status });
  requireUser.mockResolvedValue(denied);
  expect(await GET()).toBe(denied);
  expect(await PUT()).toBe(denied);
});
