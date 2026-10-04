import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const ID_A = '76561190000000001';
const ID_B = '76561190000000002';

describe.skipIf(!testDbUrl)('Steam 멤버 목록 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let roster: typeof import('./roster');
  const creator = { id: 'creator_1', name: '등록자' };

  const profile = (id: string, name: string) =>
    new Response(JSON.stringify({ response: { players: [{ steamid: id, personaname: name, avatarfull: 'http://a/x.jpg' }] } }));

  beforeAll(async () => {
    pool = await openTestDb();
    process.env.STEAM_API_KEY = 'k'.repeat(32);
    roster = await import('./roster');
    await pool.query(`delete from steam_members where steam_id like '7656119000000000_'`);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.STEAM_API_KEY;
    await pool.query(`delete from steam_members where steam_id like '7656119000000000_'`);
    await pool.end();
  });

  it('SteamID로 추가하면 프로필 이름과 함께 목록에 나온다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(profile(ID_A, '철수')));
    expect(await roster.addSteamMember(ID_A, creator)).toEqual({ steamId: ID_A, name: '철수', avatar: 'http://a/x.jpg', ownerId: null });
    expect(await roster.listSteamMembers()).toContainEqual({ steamId: ID_A, name: '철수', avatar: 'http://a/x.jpg', ownerId: null });
  });

  it('같은 계정을 다시 추가하면 중복으로 거부한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(profile(ID_A, '철수')));
    await expect(roster.addSteamMember(ID_A, creator)).rejects.toBeInstanceOf(roster.DuplicateSteamMemberError);
  });

  it('Steam이 못 찾는 계정과 잘못된 입력은 거부한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { players: [] } }))));
    await expect(roster.addSteamMember(ID_B, creator)).rejects.toBeInstanceOf(roster.SteamProfileNotFoundError);
    await expect(roster.addSteamMember('a b', creator)).rejects.toBeInstanceOf(roster.InvalidSteamInputError);
  });

  it('등록된 id만 걸러서 돌려주고, 삭제하면 사라진다', async () => {
    expect(await roster.registeredIds([ID_A, ID_B])).toEqual([ID_A]);
    await roster.removeSteamMember(ID_A);
    expect(await roster.registeredIds([ID_A])).toEqual([]);
  });
});
