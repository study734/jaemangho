import { beforeEach, describe, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), save: vi.fn(), clear: vi.fn(), members: vi.fn(), recommend: vi.fn() }));
vi.mock('@/server/viewer', () => ({ requireUser: fakes.user }));
vi.mock('@/server/http', () => import('../../../../server/http'));
vi.mock('@/server/steam/tastes', async () => ({ ...await import('../../../../server/steam/tastes'), readTaste: fakes.read, saveTaste: fakes.save, deleteTaste: fakes.clear }));
vi.mock('@/server/steam/roster', () => ({ listSteamMembers: fakes.members }));
vi.mock('@/server/steam/catalog', () => import('../../../../server/steam/catalog'));
vi.mock('@/domain/steam-personal', () => import('../../../../domain/steam-personal'));
vi.mock('@/server/steam/personalized', async () => ({ ...await import('../../../../server/steam/personalized'), personalizedGames: fakes.recommend }));
vi.mock('@/server/steam/client', () => import('../../../../server/steam/client'));
import { emptyTaste } from '../../../../domain/steam-personal';
import { GET, PUT, DELETE } from './route';
import { POST } from '../personalized/route';
const request = (body: unknown, method = 'PUT', origin = 'https://example.com') => new Request('https://example.com/api/steam/taste', { method, headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); fakes.user.mockResolvedValue({ id: 'actor' }); fakes.read.mockResolvedValue(emptyTaste());
  fakes.members.mockResolvedValue([{ steamId: '76561190000000001', name: '나', ownerId: 'actor' }]); fakes.recommend.mockResolvedValue({ games: [] });
});
describe('taste and recommendation HTTP contracts', () => {
  it('reads, saves and deletes only authenticated own data', async () => {
    const response = await GET(); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ members: [{ own: true }], taste: emptyTaste(), tags: expect.any(Array) });
    await PUT(request(emptyTaste())); await DELETE(request({}, 'DELETE'));
    expect(fakes.read).toHaveBeenCalledExactlyOnceWith('actor'); expect(fakes.save).toHaveBeenCalledExactlyOnceWith('actor', emptyTaste()); expect(fakes.clear).toHaveBeenCalledExactlyOnceWith('actor');
  });
  it('keeps login and blocked-user checks before reads, writes and recommendations', async () => {
    for (const status of [401, 403]) {
      fakes.user.mockResolvedValue(new Response(null, { status }));
      expect((await GET()).status).toBe(status); expect((await PUT(request(emptyTaste()))).status).toBe(status);
      expect((await DELETE(request({}, 'DELETE'))).status).toBe(status); expect((await POST(request({}, 'POST'))).status).toBe(status);
    }
    expect(fakes.read).not.toHaveBeenCalled(); expect(fakes.save).not.toHaveBeenCalled(); expect(fakes.recommend).not.toHaveBeenCalled();
  });
  it('rejects cross-site, oversized streamed bodies, actor spoofing and contradictory preferences', async () => {
    expect((await PUT(request(emptyTaste(), 'PUT', 'https://other.example'))).status).toBe(403);
    expect((await PUT(request({ ...emptyTaste(), junk: 'x'.repeat(17000) }))).status).toBe(413);
    expect((await PUT(request({ ...emptyTaste(), userId: 'other' }))).status).toBe(400);
    expect((await PUT(request({ ...emptyTaste(), likes: ['puzzle'], avoids: ['puzzle'] }))).status).toBe(400);
    expect((await PUT(request({ ...emptyTaste(), likedGames: [999999] }))).status).toBe(400);
    expect((await PUT(request({ ...emptyTaste(), share: true, together: [] }))).status).toBe(200); // legacy keys are dropped
    expect(fakes.save).toHaveBeenCalledExactlyOnceWith('actor', emptyTaste());
  });
  it('validates recommendation inputs and passes actor separately from selected accounts', async () => {
    expect((await POST(request({ ids: [] }, 'POST'))).status).toBe(400);
    expect((await POST(request({ ids: ['76561190000000001', '76561190000000002'] }, 'POST'))).status).toBe(400);
    expect((await POST(request({ ids: ['76561190000000001'], userId: 'other' }, 'POST'))).status).toBe(400);
    expect((await POST(request({ ids: ['76561190000000001'] }, 'POST'))).status).toBe(200);
    expect(fakes.recommend).toHaveBeenCalledExactlyOnceWith('actor', { ids: ['76561190000000001'], scope: 'any', solo: false }, expect.any(AbortSignal));
  });
});
