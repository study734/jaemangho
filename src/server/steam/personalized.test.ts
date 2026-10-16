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
    ownTaste: vi.fn().mockResolvedValue(emptyTaste()), shared: vi.fn().mockResolvedValue(new Map()) };
}
const input = { kind: 'group' as const, ids, scope: 'any' as const, solo: false };
describe('personal recommendation read service', () => {
  it('uses only selected registered members and the actor for private preferences', async () => {
    const d = deps();
    const result = await createPersonalizedService(d)('user0', { ...input, kind: 'personal', ids: [ids[0]] });
    expect(d.ownTaste).toHaveBeenCalledExactlyOnceWith('user0');
    expect(d.library).toHaveBeenCalledExactlyOnceWith(ids[0]);
    expect(result.games.length).toBeGreaterThan(0);
    await expect(createPersonalizedService(d)('user0', { ...input, kind: 'personal', ids: [ids[1]] })).rejects.toThrow('내 연결');
    await expect(createPersonalizedService(d)('user0', { ...input, ids: ['76561199999999999'] })).rejects.toThrow('등록된');
  });
  it('only includes other users through the explicit shared preference read', async () => {
    const d = deps();
    const before = await createPersonalizedService(d)('user0', input);
    d.shared.mockResolvedValue(new Map([['user1', { ...emptyTaste(), likes: ['cooking'] }]]));
    const after = await createPersonalizedService(d)('user0', input);
    expect(after.games.find(game => game.appId === 1599600)!.score).toBeGreaterThan(before.games.find(game => game.appId === 1599600)!.score!);
    expect(after.sharedPreferences).toBe(1);
    expect(d.ownTaste.mock.calls.every(args => args[0] === 'user0')).toBe(true);
  });
  it('preserves partial/private ownership as unavailable, not a partial common result', async () => {
    const d = deps(); d.library.mockResolvedValueOnce({ ok: false });
    const result = await createPersonalizedService(d)('user0', input);
    expect(result.games).toEqual([]); expect(result.excluded).toEqual([ids[0]]);
    expect(d.metadata).not.toHaveBeenCalled();
  });
  it('does not count two linked accounts owned by one user as two people', async () => {
    const d = deps(); d.members.mockResolvedValue(ids.map(steamId => ({ steamId, name: '나', avatar: null, ownerId: 'user0' })));
    await expect(createPersonalizedService(d)('user0', input)).rejects.toThrow('하나만 선택');
    expect(d.library).not.toHaveBeenCalled();
  });
  it('distinguishes recent lookup failure, metadata failure and independent play from shared sessions', async () => {
    const d = deps(); d.recent.mockRejectedValue(new Error('private-url'));
    const result = await createPersonalizedService(d)('user0', input);
    expect(result.recentUnavailable).toEqual(ids);
    expect(result.groupExamples).toEqual([{ appId: 620, name: 'Portal 2', players: 2, source: 'steam-overlap' }]);
    d.ownTaste.mockResolvedValue({ ...emptyTaste(), together: [{ appId: 620, steamIds: ids }] });
    const reported = await createPersonalizedService(d)('user0', input);
    expect(reported.groupExamples[0].source).toBe('user-reported');
    expect(JSON.stringify(reported)).not.toContain('private-url');
  });
  it('bounds source metadata to 24 games regardless of library size', async () => {
    const d = deps(); d.library.mockResolvedValue({ ok: true, games: Array.from({ length: 500 }, (_, i) => ({ appId: 900000 + i, name: `Game ${i}`, minutes: i + 1 })) });
    await createPersonalizedService(d)('user0', input);
    expect(d.metadata).toHaveBeenCalledTimes(24 + recommendationCatalog.length);
  });
  it('ends a slow turn without starting metadata lookups after the deadline', async () => {
    const d = deps(); let finish!: (value: { ok: true; games: [] }) => void;
    d.library.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await expect(createPersonalizedService(d, 10)('user0', { ...input, kind: 'personal', ids: [ids[0]] })).rejects.toMatchObject({ status: 504 });
    finish({ ok: true, games: [] }); await Promise.resolve(); await Promise.resolve();
    expect(d.metadata).not.toHaveBeenCalled();
  });
  it('inherits an expired or cancelled parent budget instead of starting a fresh tool deadline', async () => {
    const d = deps(), controller = new AbortController(); controller.abort();
    await expect(createPersonalizedService(d)('user0', input, controller.signal)).rejects.toMatchObject({ status: 504 });
    expect(d.members).not.toHaveBeenCalled();
    const active = new AbortController(); let finish!: (value: { ok: true; games: [] }) => void;
    d.library.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = createPersonalizedService(d)('user0', { ...input, kind: 'personal', ids: [ids[0]] }, active.signal);
    await vi.waitFor(() => expect(d.library).toHaveBeenCalled()); active.abort();
    await expect(pending).rejects.toMatchObject({ status: 504 });
    finish({ ok: true, games: [] }); await Promise.resolve(); await Promise.resolve();
    expect(d.metadata).not.toHaveBeenCalled();
  });
});
