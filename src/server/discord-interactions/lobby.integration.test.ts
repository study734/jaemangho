import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('Discord lobby store (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let store: typeof import('./lobby');
  const owner = '100000000000000003';
  const friends = ['100000000000000004', '100000000000000005', '100000000000000006', '100000000000000007'];
  const cleanup = () => pool.query(`delete from discord_lobbies where id like '3000000000000000%'`);
  beforeAll(async () => { pool = await openTestDb(); store = await import('./lobby'); await cleanup(); });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('creates idempotently with the owner as the first member', async () => {
    const created = await store.createLobby({ id: '300000000000000001', ownerId: owner, game: 'Lethal', playTime: null, max: 3 });
    expect(created).toEqual({ id: '300000000000000001', ownerId: owner, game: 'Lethal', playTime: null, max: 3, memberIds: [owner], closed: false, version: 1 });
    expect(await store.createLobby({ id: '300000000000000001', ownerId: friends[0], game: 'x', playTime: null, max: null })).toEqual(created);
  });
  it('never exceeds capacity or duplicates members under concurrent joins', async () => {
    const results = await Promise.all([...friends, friends[0]].map(id => store.changeLobby('300000000000000001', id, 'join')));
    expect(results.filter(Boolean)).toHaveLength(2);
    const lobby = (await store.loadLobby('300000000000000001'))!;
    expect(lobby.memberIds).toHaveLength(3); expect(new Set(lobby.memberIds).size).toBe(3);
    expect(lobby.version).toBe(3);
  });
  it('explains refusals: full, duplicate, owner leave, non-owner close, closed, expired', async () => {
    const edit = vi.fn();
    const lobby = (await store.loadLobby('300000000000000001'))!;
    const outsider = friends.find(id => !lobby.memberIds.includes(id))!;
    const member = lobby.memberIds.find(id => id !== owner)!;
    expect((await store.lobbyAction(lobby.id, outsider, 'join', edit))?.content).toContain('다 찼어요');
    expect((await store.lobbyAction(lobby.id, member, 'join', edit))?.content).toContain('이미 참여');
    expect((await store.lobbyAction(lobby.id, owner, 'leave', edit))?.content).toContain('마감');
    expect((await store.lobbyAction(lobby.id, member, 'close', edit))?.content).toContain('연 사람만');
    expect(edit).not.toHaveBeenCalled();
    expect(await store.lobbyAction(lobby.id, member, 'leave', edit)).toBeNull();
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit.mock.calls[0][0].content).not.toContain(`<@${member}>`);
    expect(await store.lobbyAction(lobby.id, owner, 'close', edit)).toBeNull();
    expect(edit.mock.calls[1][0].components).toEqual([]);
    expect((await store.lobbyAction(lobby.id, outsider, 'join', edit))?.content).toContain('마감된');
    await store.createLobby({ id: '300000000000000002', ownerId: owner, game: null, playTime: null, max: null });
    await pool.query(`update discord_lobbies set created_at = now() - interval '25 hours' where id = '300000000000000002'`);
    expect(await store.loadLobby('300000000000000002')).toBeNull();
    expect((await store.lobbyAction('300000000000000002', friends[0], 'join', edit))?.content).toContain('24시간');
  });
  it('re-edits with the latest state when another change lands during an edit (no stale overwrite)', async () => {
    await store.createLobby({ id: '300000000000000003', ownerId: owner, game: null, playTime: null, max: null });
    const seen: string[] = [];
    let raced = false;
    await store.renderLobby('300000000000000003', async message => {
      seen.push(message.content);
      if (!raced) { raced = true; await store.changeLobby('300000000000000003', friends[0], 'join'); }
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain(`<@${friends[0]}>`);
  });
});
