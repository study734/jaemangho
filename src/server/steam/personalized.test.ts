import { describe, expect, it, vi } from 'vitest';
import { emptyTaste } from '../../domain/steam-personal';
import { createPersonalizedService } from './personalized';
import { recommendationCatalog } from './catalog';

const ids = ['76561190000000001', '76561190000000002'];
function deps() {
  return { members: vi.fn().mockResolvedValue(ids.map((steamId, i) => ({ steamId, name: `친구${i}`, avatar: null, ownerId: `user${i}` }))),
    library: vi.fn().mockResolvedValue({ ok: true, games: [{ appId: 620, name: 'Portal 2', minutes: 120 }] }),
    recent: vi.fn().mockResolvedValue({ ok: true, games: [{ appId: 620, minutes: 30 }] }),
    metadata: vi.fn(async (id: number) => recommendationCatalog.find(game => game.appId === id)?.tags ?? ['action' as const]),
    ownTaste: vi.fn().mockResolvedValue(emptyTaste()) };
}
const input = { ids: [ids[0]], scope: 'any' as const, solo: false };
describe('personal recommendation read service', () => {
  it('uses only selected registered members and the actor for private preferences', async () => {
    const d = deps();
    const result = await createPersonalizedService(d)('user0', input);
    expect(d.ownTaste).toHaveBeenCalledExactlyOnceWith('user0');
    expect(d.library).toHaveBeenCalledExactlyOnceWith(ids[0]);
    expect(result.games.length).toBeGreaterThan(0);
    await expect(createPersonalizedService(d)('user0', { ...input, ids: [ids[1]] })).rejects.toThrow('내 연결');
    await expect(createPersonalizedService(d)('user0', { ...input, ids: ['76561199999999999'] })).rejects.toThrow('등록된');
  });
  it('preserves partial/private ownership as unavailable, not a partial common result', async () => {
    const d = deps(); d.library.mockResolvedValueOnce({ ok: false });
    const result = await createPersonalizedService(d)('user0', input);
    expect(result.games).toEqual([]); expect(result.excluded).toEqual([ids[0]]);
    expect(d.metadata).not.toHaveBeenCalled();
  });
  it('distinguishes a failed recent lookup from the result and never leaks its cause', async () => {
    const d = deps(); d.recent.mockRejectedValue(new Error('private-url'));
    const result = await createPersonalizedService(d)('user0', input);
    expect(result.recentUnavailable).toEqual([ids[0]]);
    expect(JSON.stringify(result)).not.toContain('private-url');
  });
  it('bounds source metadata to 24 games regardless of library size', async () => {
    const d = deps(); d.library.mockResolvedValue({ ok: true, games: Array.from({ length: 500 }, (_, i) => ({ appId: 900000 + i, name: `Game ${i}`, minutes: i + 1 })) });
    await createPersonalizedService(d)('user0', input);
    expect(d.metadata).toHaveBeenCalledTimes(24 + recommendationCatalog.length);
  });
  it('ends a slow turn without starting metadata lookups after the deadline', async () => {
    const d = deps(); let finish!: (value: { ok: true; games: [] }) => void;
    d.library.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await expect(createPersonalizedService(d, 10)('user0', input)).rejects.toMatchObject({ status: 504 });
    finish({ ok: true, games: [] }); await Promise.resolve(); await Promise.resolve();
    expect(d.metadata).not.toHaveBeenCalled();
  });
  it('inherits an expired or cancelled parent budget instead of starting a fresh tool deadline', async () => {
    const d = deps(), controller = new AbortController(); controller.abort();
    await expect(createPersonalizedService(d)('user0', input, controller.signal)).rejects.toMatchObject({ status: 504 });
    expect(d.members).not.toHaveBeenCalled();
    const active = new AbortController(); let finish!: (value: { ok: true; games: [] }) => void;
    d.library.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = createPersonalizedService(d)('user0', input, active.signal);
    await vi.waitFor(() => expect(d.library).toHaveBeenCalled()); active.abort();
    await expect(pending).rejects.toMatchObject({ status: 504 });
    finish({ ok: true, games: [] }); await Promise.resolve(); await Promise.resolve();
    expect(d.metadata).not.toHaveBeenCalled();
  });
});
