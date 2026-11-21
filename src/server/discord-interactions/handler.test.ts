import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUser, commandAccess, linkedPlayers } from './access';
import { adminTask } from './admin';
import { createLobby, lobbyAction, loadLobby } from './lobby';
import { saveFeedback } from './feedback';
import { recordBlock, recordUsage } from './usage';
import { claimNudges } from './nudge';
import { lastParty, loadParty, saveParty, setPartyPreference } from './party';
import { acceptSteamConsent, hasSteamConsent } from '../steam/consent';
import { runSteamCollection } from '../activity/steam-collection';
import { getDeals } from '../steam/deals';
import { compareGames } from '../steam/games';
import { findMissions } from '../steam/missions';
import { recommendGames, type RecommendationsResult } from '../steam/recommendations';
import { completeInteraction, editReply, receiveInteraction } from './handler';
import { friendPicker, interactionSchema, privateMessage, type Interaction } from './protocol';

vi.mock('./access', () => ({ commandAccess: vi.fn(), commandUser: vi.fn(), linkedPlayers: vi.fn(), adminUser: vi.fn() }));
vi.mock('./admin', async original => ({ ...await original<typeof import('./admin')>(), adminTask: vi.fn() }));
vi.mock('./party', () => ({ saveParty: vi.fn(), loadParty: vi.fn(), lastParty: vi.fn(), setPartyPreference: vi.fn() }));
vi.mock('./lobby', async original => ({ ...await original<typeof import('./lobby')>(), createLobby: vi.fn(), lobbyAction: vi.fn(), loadLobby: vi.fn() }));
vi.mock('./nudge', async original => ({ ...await original<typeof import('./nudge')>(), claimNudges: vi.fn() }));
vi.mock('../activity/steam-collection', () => ({ runSteamCollection: vi.fn(), SteamCollectionBusyError: class extends Error {} }));
vi.mock('../steam/consent', () => ({ hasSteamConsent: vi.fn(), acceptSteamConsent: vi.fn(), STEAM_FEATURE_NOTICE: 'steam-common-v1' }));
vi.mock('./feedback', async original => ({ ...await original<typeof import('./feedback')>(), saveFeedback: vi.fn() }));
vi.mock('./usage', async original => ({ ...await original<typeof import('./usage')>(), recordUsage: vi.fn(), recordBlock: vi.fn() }));
vi.mock('../steam/deals', () => ({ getDeals: vi.fn() }));
vi.mock('../steam/games', () => ({ compareGames: vi.fn() }));
vi.mock('../steam/missions', () => ({ findMissions: vi.fn() }));
vi.mock('../steam/recommendations', () => ({ recommendGames: vi.fn() }));
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const app = '100000000000000001', guild = '100000000000000002', owner = '100000000000000003', friend = '100000000000000004';
const steamIds = ['76561190000000001', '76561190000000002'];
const env = { DISCORD_PUBLIC_KEY: publicKey, DISCORD_CLIENT_ID: app, DISCORD_GUILD_ID: guild };
const command = () => ({ id: '100000000000000009', type: 2, application_id: app, token: 'fixture-token', guild_id: guild,
  member: { user: { id: owner } }, data: { name: '게임추천', type: 1 } });
const component = (scope = 'all') => ({ ...command(), type: 3,
  data: { component_type: 5, custom_id: `steamrec:v1:${owner}:${scope}:${Math.floor(Date.now() / 1000)}`, values: [owner, friend] } });
const parsed = (value: unknown) => interactionSchema.parse(value) as Interaction;
const request = (value: unknown, timestamp = String(Math.floor(Date.now() / 1000)), raw?: string) => {
  const body = raw ?? JSON.stringify(value);
  const signature = sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex');
  return new Request('http://localhost/api/discord/interactions', { method: 'POST', body,
    headers: { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': signature } });
};
const result: RecommendationsResult = { games: [{ appId: 730, name: 'Game [safe]', reasons: ['선택한 2명 모두 보유'], support: 'coop', missingIds: [],
  score: 50, totalMinutes: 60, playedBy: 2, beginnerCount: 2, minMinutes: 30, maxMinutes: 30, owners: 2 }],
  excluded: [], checked: 1, unverified: 0, totalCommon: 1, totalCandidates: 1, recentUnavailable: [] };
let fetchFn: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks();
  vi.mocked(commandAccess).mockResolvedValue({ kind: 'ok', userId: 'user_owner' });
  vi.mocked(hasSteamConsent).mockResolvedValue(true);
  vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }, { discordId: friend, steamId: steamIds[1] }]);
  vi.mocked(recommendGames).mockResolvedValue(result);
  fetchFn = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchFn);
});
const lastMessage = () => JSON.parse(fetchFn.mock.calls.at(-1)![1].body);

describe('signed Discord request', () => {
  it('answers signed PING without DB, handles raw whitespace, and rejects forged or stale requests', async () => {
    const defer = vi.fn();
    expect(await (await receiveInteraction(request({}, undefined, ' { "type": 1 } '), defer, env)).json()).toEqual({ type: 1 });
    const forged = request({ type: 1 }); forged.headers.set('x-signature-ed25519', '0'.repeat(128));
    expect((await receiveInteraction(forged, defer, env)).status).toBe(401);
    expect((await receiveInteraction(request({ type: 1 }, String(Math.floor(Date.now() / 1000) - 301)), defer, env)).status).toBe(401);
    expect((await receiveInteraction(request({ type: 1 }), defer, {})).status).toBe(503);
    expect(commandAccess).not.toHaveBeenCalled(); expect(defer).not.toHaveBeenCalled();
  });
  it('rejects a changed body, malformed signed JSON, and oversized requests', async () => {
    const signed = request({ type: 1 });
    const changed = new Request(signed.url, { method: 'POST', headers: signed.headers, body: '{"type":2}' });
    expect((await receiveInteraction(changed, vi.fn(), env)).status).toBe(401);
    expect((await receiveInteraction(request(null, undefined, '{broken'), vi.fn(), env)).status).toBe(400);
    expect((await receiveInteraction(request(null, undefined, ' '.repeat(65_537)), vi.fn(), env)).status).toBe(413);
  });
  it('acknowledges before any DB/Steam lookup and invokes the scheduled work afterwards', async () => {
    const deferred: (() => Promise<void>)[] = [];
    const start = performance.now();
    const response = await receiveInteraction(request(command()), work => deferred.push(work), env);
    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(commandAccess).not.toHaveBeenCalled(); expect(recommendGames).not.toHaveBeenCalled();
    await deferred[0]();
    expect(commandAccess).toHaveBeenCalledWith({ user: { id: owner } });
    expect(lastMessage().components[0].components[0]).toMatchObject({ type: 5, min_values: 2, max_values: 20 });
  });
  it('rejects different apps/servers, DMs, unknown commands and invalid selections before scheduling', async () => {
    const defer = vi.fn();
    for (const value of [{ ...command(), guild_id: friend }, { ...command(), application_id: friend }]) {
      expect(await (await receiveInteraction(request(value), defer, env)).json()).toMatchObject({ type: 4, data: { flags: 64 } });
    }
    const dm = { ...command(), guild_id: undefined, member: undefined, user: { id: owner } };
    for (const value of [dm, { ...command(), data: { name: 'unknown', type: 1 } }, component('bad'),
      { ...component(), data: { ...component().data, values: [owner, owner] } },
      { ...component(), data: { ...component().data, values: Array(21).fill(owner) } }]) {
      expect((await receiveInteraction(request(value), defer, env)).status).toBe(400);
    }
    expect(defer).not.toHaveBeenCalled(); expect(commandAccess).not.toHaveBeenCalled();
  });
});

describe('message command 출처 찾기', () => {
  const sourceCommand = (attachments: unknown[]) => parsed({ ...command(), data: { name: '출처 찾기', type: 3, target_id: friend,
    resolved: { messages: { [friend]: { attachments } } } } });
  it('is gated by the same account check and never starts a lookup for a denied requester', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    await completeInteraction(sourceCommand([{ url: 'https://cdn.discordapp.com/a.png', content_type: 'image/png' }]));
    expect(lastMessage().content).toContain('차단');
    expect(fetchFn.mock.calls.every(call => !String(call[0]).includes('trace.moe'))).toBe(true);
  });
  it('looks up the clicked message attachment and edits the private reply', async () => {
    fetchFn.mockImplementation(async (url: string) => new Response(String(url).includes('trace.moe')
      ? JSON.stringify({ result: [{ anilist: { id: 1, title: { native: '作品' } }, episode: 1, from: 60, similarity: 0.95 }] }) : '{}'));
    await completeInteraction(sourceCommand([{ url: 'https://cdn.discordapp.com/a.png', content_type: 'image/png' }]));
    expect(lastMessage().content).toContain('**作品** 1화 · 1:00 부근');
    expect(recommendGames).not.toHaveBeenCalled();
  });
});

describe('game recommendation flow', () => {
  it('checks bans on every command/click and never starts Steam for a denied requester', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    for (const value of [command(), component()]) await completeInteraction(parsed(value));
    expect(lastMessage().content).toContain('차단');
    expect(linkedPlayers).not.toHaveBeenCalled(); expect(recommendGames).not.toHaveBeenCalled();
  });
  it.each(['all', 'any', 'unowned'])('maps selected Discord users to Steam and reuses %s recommendations', async scope => {
    await completeInteraction(parsed(component(scope)));
    expect(linkedPlayers).toHaveBeenCalledWith([owner, friend]);
    expect(recommendGames).toHaveBeenCalledWith(steamIds, 'balanced', scope);
    expect(lastMessage().content).toContain('https://store.steampowered.com/app/730/');
    expect(lastMessage().allowed_mentions).toEqual({ parse: [] });
    expect(lastMessage().content.length).toBeLessThanOrEqual(2000);
  });
  it('does not guess missing, blocked, ambiguous or duplicated Steam accounts', async () => {
    vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }]);
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('Steam이 연결되지 않은 친구');
    vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }, { discordId: owner, steamId: '76561190000000003' }, { discordId: friend, steamId: steamIds[1] }]);
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('여러 개');
    vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }, { discordId: friend, steamId: steamIds[0] }]);
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('같은 Steam');
    expect(recommendGames).not.toHaveBeenCalled();
  });
  it('rejects another user or expired picker without querying participant libraries', async () => {
    const another = component(); another.member = { user: { id: friend } };
    await completeInteraction(parsed(another));
    const expired = component(); expired.data.custom_id = `steamrec:v1:${owner}:all:${Math.floor(Date.now() / 1000) - 901}`;
    await completeInteraction(parsed(expired));
    expect(lastMessage().content).toContain('만료'); expect(linkedPlayers).not.toHaveBeenCalled();
  });
  it('distinguishes private libraries, empty results, stale registrations and service failure', async () => {
    vi.mocked(recommendGames).mockResolvedValue({ ...result, games: [], excluded: [steamIds[1]] });
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('공개 설정');
    vi.mocked(recommendGames).mockResolvedValue({ ...result, games: [], unverified: 1 });
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('지원 정보');
    vi.mocked(recommendGames).mockResolvedValue({ unknownIds: [steamIds[0]] });
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('변경');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(recommendGames).mockRejectedValue(new Error('secret-upstream-url'));
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('처리하지 못');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-upstream-url');
  });
  it('shows missing owners for any scope and keeps long output within Discord limits', async () => {
    const games = Array.from({ length: 12 }, (_, i) => ({ ...result.games[0], appId: i + 1, name: '*'.repeat(150), missingIds: [steamIds[1]], reasons: ['r'.repeat(150), 'r'.repeat(150)] }));
    vi.mocked(recommendGames).mockResolvedValue({ ...result, games });
    await completeInteraction(parsed(component('any')));
    expect(lastMessage().content).toContain(`없음: <@${friend}>`);
    expect(lastMessage().content.length).toBeLessThanOrEqual(2000);
    expect(lastMessage().content).not.toContain('/app/6/');
  });
  it('answers slow work at 45 seconds and does not later send a stale success', async () => {
    vi.useFakeTimers();
    let release!: (access: { kind: 'ok'; userId: string | null }) => void;
    vi.mocked(commandAccess).mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = completeInteraction(parsed(command()));
    await vi.advanceTimersByTimeAsync(45_000); await pending;
    expect(lastMessage().content).toContain('조회 시간이 길어');
    release({ kind: 'ok', userId: 'user_owner' }); await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
  it('returns a usable picker without storing state or needing a fixed roster list', () => {
    expect(JSON.stringify(friendPicker(owner, 'any'))).toContain(`steamrec:v2:${owner}:any:balanced:`);
    expect(JSON.stringify(friendPicker(owner, 'all', 'recent'))).toContain(`steamrec:v2:${owner}:all:recent:`);
  });
});

describe('Discord delivery failure and recovery', () => {
  it.each([10008, 10015])('finishes the deferred reply after a transient Discord missing-resource error %s', async code => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ code, message: 'Unknown resource' }, { status: 404 }))
      .mockResolvedValueOnce(new Response('{}'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await editReply(app, 'fixture-token', privateMessage('ok'), fetchFn, sleep)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('bounds persistent 404 retries and logs only numeric error codes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockImplementation(async () => Response.json({ code: 10015, message: 'private-token' }, { status: 404 }));
    expect(await editReply(app, 'private-token', privateMessage('ok'), fetchFn, sleep)).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
    expect(log).toHaveBeenLastCalledWith('discord interaction reply failed:', 404, 'code:', 10015);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-token');
  });
  it('retries network/5xx failures with an idempotent PATCH, and obeys a short retry_after', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('secret')).mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response('{}'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await editReply(app, 'fixture-token', privateMessage('ok'), fetchFn, sleep)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3); expect(sleep).toHaveBeenCalledTimes(2);
    fetchFn.mockReset().mockResolvedValueOnce(Response.json({ retry_after: 0.1 }, { status: 429 })).mockResolvedValueOnce(new Response('{}'));
    expect(await editReply(app, 'fixture-token', privateMessage('ok'), fetchFn, sleep)).toBe(true);
    expect(sleep).toHaveBeenLastCalledWith(150);
  });
  it('does not retry auth failures or waits beyond the budget, and redacts tokens/errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}); const sleep = vi.fn();
    for (const status of [401, 403, 404, 429]) {
      const fetchFn = vi.fn().mockResolvedValue(Response.json({ retry_after: 100 }, { status }));
      expect(await editReply(app, 'private-token', privateMessage('ok'), fetchFn, sleep)).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
    const fetchFn = vi.fn().mockRejectedValue(new Error('private-token'));
    expect(await editReply(app, 'private-token', privateMessage('ok'), fetchFn, vi.fn().mockResolvedValue(undefined))).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-token'); expect(sleep).not.toHaveBeenCalled();
  });
});

describe('slash command 패치노트', () => {
  it('shows only the Discord notes through the same account check', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'ok', userId: 'user_owner' });
  vi.mocked(hasSteamConsent).mockResolvedValue(true);
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(lastMessage().content).toContain('출처 찾기');
    expect(lastMessage().content).not.toContain('디스코드 위젯');
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(lastMessage().content).toContain('차단');
  });
});

describe('Steam consent and party follow-ups', () => {
  const partyId = '100000000000000009';
  const party = { id: partyId, ownerId: owner, discordIds: [owner, friend], scope: 'all' as const, preference: 'recent' as const };
  const button = (customId: string) => parsed({ ...command(), id: '100000000000000010', type: 3, data: { component_type: 2, custom_id: customId } });
  const select = (customId: string, value: string) => parsed({ ...command(), id: '100000000000000010', type: 3, data: { component_type: 3, custom_id: customId, values: [value] } });
  beforeEach(() => { vi.mocked(loadParty).mockResolvedValue(party); });

  it('requires the requester’s current Steam consent like the web, before any picker or Steam lookup', async () => {
    vi.mocked(hasSteamConsent).mockResolvedValue(false);
    for (const value of [parsed(command()), parsed(component()), button(`party:${partyId}:deals`)]) {
      await completeInteraction(value);
      // 디스코드 안에서 동의하는 버튼(intent/0005 R4)만 있고 추천 버튼·선택창은 없다.
      expect(JSON.stringify(lastMessage().components)).toContain('steamconsent:accept');
      expect(JSON.stringify(lastMessage().components)).not.toMatch(/steamrec|party:/);
    }
    expect(hasSteamConsent).toHaveBeenCalledWith('user_owner');
    expect(linkedPlayers).not.toHaveBeenCalled(); expect(saveParty).not.toHaveBeenCalled(); expect(getDeals).not.toHaveBeenCalled();
  });
  it('carries the 기준 option through the picker, stores the party and attaches follow-up buttons', async () => {
    await completeInteraction(parsed({ ...command(), data: { name: '게임추천', type: 1, options: [{ name: '범위', type: 3, value: 'any' }, { name: '기준', type: 3, value: 'recent' }] } }));
    const customId = lastMessage().components[0].components[0].custom_id;
    expect(customId).toMatch(new RegExp(`^steamrec:v2:${owner}:any:recent:\\d{10}$`));
    await completeInteraction(parsed({ ...component(), data: { component_type: 5, custom_id: customId, values: [owner, friend] } }));
    expect(saveParty).toHaveBeenCalledWith({ id: '100000000000000009', ownerId: owner, discordIds: [owner, friend], scope: 'any', preference: 'recent' });
    expect(recommendGames).toHaveBeenCalledWith(steamIds, 'recent', 'any');
    expect(lastMessage().content).toContain('요즘 크루픽');
    expect(lastMessage().components[0].components.map((c: { custom_id: string }) => c.custom_id))
      .toEqual(['pick', 'deals', 'missions', 'common'].map(action => `party:100000000000000009:${action}`));
  });
  it('stores no party and shows no buttons when the selected accounts cannot be used', async () => {
    vi.mocked(linkedPlayers).mockResolvedValue([]);
    await completeInteraction(parsed(component()));
    // 추천 버튼은 없고, 연결 안 된 친구 알림·연결 화면 버튼만 붙는다(intent/0005 R5).
    expect(saveParty).not.toHaveBeenCalled(); expect(JSON.stringify(lastMessage().components)).not.toContain('party:');
    vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }, { discordId: friend, steamId: steamIds[1] }]);
    vi.mocked(recommendGames).mockResolvedValue({ ...result, games: [], excluded: [steamIds[1]] });
    await completeInteraction(parsed(component()));
    expect(lastMessage().content).toContain(`<@${friend}>`); expect(lastMessage().components).toEqual([]);
  });
  it('rejects expired or foreign parties without Steam lookups', async () => {
    vi.mocked(loadParty).mockResolvedValue(null);
    await completeInteraction(button(`party:${partyId}:common`));
    expect(loadParty).toHaveBeenCalledWith(partyId, owner);
    expect(lastMessage().content).toContain('만료'); expect(compareGames).not.toHaveBeenCalled();
  });
  it('picks uniformly from the party’s recommendations, skipping the previous pick', async () => {
    const games = [1, 2, 3].map(appId => ({ ...result.games[0], appId, name: `Game ${appId}` }));
    vi.mocked(recommendGames).mockResolvedValue({ ...result, games });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await completeInteraction(button(`party:${partyId}:pick:1`));
    expect(recommendGames).toHaveBeenCalledWith(steamIds, 'recent', 'all');
    expect(lastMessage().content).toContain('/app/2/');
    expect(lastMessage().components[0].components[0].custom_id).toBe(`party:${partyId}:pick:2`);
  });
  it('lists sale deals with prices and who still needs the game', async () => {
    vi.mocked(getDeals).mockResolvedValue({ deals: [{ appId: 10, name: 'Coop', price: { final: 9900, initial: 33000, discountPercent: 70 }, missingIds: [steamIds[1]] },
      { appId: 11, name: 'Free', price: null, missingIds: [steamIds[0]] }], excluded: [], alreadyOwned: 2, pricesUnavailable: false });
    await completeInteraction(button(`party:${partyId}:deals`));
    expect(getDeals).toHaveBeenCalledWith(steamIds);
    expect(lastMessage().content).toContain('**-70%** ₩9,900 (정가 ₩33,000)');
    expect(lastMessage().content).toContain(`없는 사람: <@${friend}>`);
    expect(lastMessage().content).toContain('2개는 뺐어요');
  });
  it('lists common games by shared playtime and offers them for 같이 도전 (max 25)', async () => {
    const games = Array.from({ length: 30 }, (_, i) => ({ appId: i + 1, name: `G${i + 1}`, owners: 2, totalMinutes: i * 60 }));
    vi.mocked(compareGames).mockResolvedValue({ games, excluded: [] });
    await completeInteraction(button(`party:${partyId}:common`));
    expect(compareGames).toHaveBeenCalledWith(steamIds, 'common');
    expect(lastMessage().content).toMatch(/모두 가진 게임 30개[\s\S]*1\. \[G30\]/);
    await completeInteraction(button(`party:${partyId}:missions`));
    const menu = lastMessage().components[0].components[0];
    expect(menu).toMatchObject({ type: 3, custom_id: `party:${partyId}:mission` });
    expect(menu.options).toHaveLength(25); expect(menu.options[0]).toMatchObject({ value: '30', label: 'G30' });
    vi.mocked(compareGames).mockResolvedValue({ games: [], excluded: [steamIds[0]] });
    await completeInteraction(button(`party:${partyId}:missions`));
    expect(lastMessage().content).toContain(`<@${owner}>`); expect(lastMessage().components).toEqual([]);
  });
  it('compares achievements for the chosen game and distinguishes failure states', async () => {
    vi.mocked(findMissions).mockResolvedValue({ state: 'ok', totalPublic: 10, completedTogether: 3, unknownAchievements: 0, unavailableIds: [], missingIds: [],
      missions: [{ id: 'a', title: 'First', description: null, kind: 'team-first', unlockedIds: [], lockedIds: steamIds },
        { id: 'b', title: 'Catch', description: 'desc', kind: 'catch-up', unlockedIds: [steamIds[0]], lockedIds: [steamIds[1]] }] });
    await completeInteraction(select(`party:${partyId}:mission`, '730'));
    expect(findMissions).toHaveBeenCalledWith(steamIds, 730);
    expect(lastMessage().content).toContain('**First** — 팀 첫 도전');
    expect(lastMessage().content).toContain(`따라잡기 · 아직: <@${friend}>`);
    vi.mocked(findMissions).mockResolvedValue({ state: 'unavailable', totalPublic: 0, completedTogether: 0, unknownAchievements: 0, unavailableIds: [steamIds[1]], missingIds: [], missions: [] });
    await completeInteraction(select(`party:${partyId}:mission`, '730'));
    expect(lastMessage().content).toContain(`진행도를 확인할 수 없어요: <@${friend}>`);
  });
});

describe('command definitions', () => {
  it('every registered command and option parses with the signed-request schema', async () => {
    const { default: commands } = await import('./commands.json');
    const sample = { 게임추천: { options: [{ name: '범위', type: 3, value: 'all' }, { name: '기준', type: 3, value: 'fresh' }] },
      패치노트: {}, 기록: {}, 멤버: { options: [{ name: '대상', type: 6, value: friend }] },
      전적: { options: [{ name: '닉네임', type: 3, value: 'Hide on bush#KR1' }] },
      모집: { options: [{ name: '게임', type: 3, value: 'Lethal' }, { name: '시간', type: 3, value: '오늘 10시' }, { name: '인원', type: 4, value: 4 }] }, 개선: {},
      운영: { options: [{ name: '캐시', type: 1, options: [{ name: '종류', type: 3, value: 'riot' }] }] },
      '출처 찾기': { target_id: friend, resolved: { messages: { [friend]: { attachments: [] } } } },
      의견: {}, '재순이에게 전달': { target_id: friend, resolved: { messages: { [friend]: { attachments: [] } } } } } as Record<string, object>;
    for (const definition of commands) {
      expect(interactionSchema.safeParse({ ...command(), data: { name: definition.name, type: definition.type, ...sample[definition.name] } }).success).toBe(true);
    }
    expect(Object.keys(sample)).toEqual(commands.map(c => c.name));
    expect(interactionSchema.safeParse({ ...command(), type: 3, data: { component_type: 2, custom_id: 'party:1:pick' } }).success).toBe(false);
    expect(interactionSchema.safeParse({ ...command(), data: { name: '기록', type: 1, options: [{ name: '다른것', type: 1 }] } }).success).toBe(false);
    // 배포 전환 중 이전 정의(하위 명령)로 온 요청도 받아 같은 결과를 준다.
    expect(interactionSchema.safeParse({ ...command(), data: { name: '기록', type: 1, options: [{ name: '순간', type: 1 }] } }).success).toBe(true);
  });
});

describe('admin commands', () => {
  const admin = (data: object, permissions?: string) => parsed({ ...command(), member: { user: { id: owner }, ...(permissions ? { permissions } : {}) }, data });
  it('runs only when adminUser accepts the signed permissions, and never starts the task otherwise', async () => {
    vi.mocked(adminUser).mockResolvedValue(null);
    await completeInteraction(admin({ name: '개선', type: 1 }, '0'));
    expect(adminUser).toHaveBeenCalledWith(owner, '0');
    expect(lastMessage().content).toContain('관리자만');
    await completeInteraction(admin({ name: '운영', type: 1, options: [{ name: '동기화', type: 1 }] }));
    expect(adminUser).toHaveBeenLastCalledWith(owner, undefined);
    expect(adminTask).not.toHaveBeenCalled();
  });
  it('maps subcommands to tasks with the verified actor', async () => {
    const actor = { id: 'user_owner', name: 'Owner' };
    vi.mocked(adminUser).mockResolvedValue(actor);
    vi.mocked(adminTask).mockResolvedValue(privateMessage('done'));
    await completeInteraction(admin({ name: '개선', type: 1 }, '8'));
    await completeInteraction(admin({ name: '운영', type: 1, options: [{ name: '상태', type: 1 }] }, '8'));
    await completeInteraction(admin({ name: '운영', type: 1, options: [{ name: '캐시', type: 1, options: [{ name: '종류', type: 3, value: 'steam' }] }] }, '8'));
    await completeInteraction(admin({ name: '운영', type: 1, options: [{ name: '시상식채널', type: 1, options: [{ name: '채널', type: 7, value: '100000000000000777' }] }] }, '8'));
    await completeInteraction(admin({ name: '운영', type: 1, options: [{ name: '시상식게시', type: 1 }] }, '8'));
    expect(vi.mocked(adminTask).mock.calls).toEqual([['개선', actor, undefined], ['상태', actor, undefined], ['steam', actor, undefined],
      ['시상식채널', actor, '100000000000000777'], ['시상식게시', actor, undefined]]);
    expect(lastMessage().content).toBe('done');
  });
  it('rejects malformed permission fields and unknown subcommands before scheduling', async () => {
    const defer = vi.fn();
    for (const value of [{ ...command(), member: { user: { id: owner }, permissions: 'all' }, data: { name: '개선', type: 1 } },
      { ...command(), data: { name: '운영', type: 1, options: [{ name: '차단', type: 1 }] } }]) {
      expect((await receiveInteraction(request(value), defer, env)).status).toBe(400);
    }
    expect(defer).not.toHaveBeenCalled();
  });
});

describe('/모집 (public lobby)', () => {
  const lobby = { id: '100000000000000009', ownerId: owner, game: 'Lethal', playTime: '오늘 10시', max: 4, memberIds: [owner], closed: false, version: 1 };
  const lobbyCommand = () => parsed({ ...command(), data: { name: '모집', type: 1, options: [{ name: '게임', type: 3, value: 'Lethal' }, { name: '시간', type: 3, value: '오늘 10시' }, { name: '인원', type: 4, value: 4 }] } });
  const lobbyButton = (action: string, member = friend) => parsed({ ...command(), id: '100000000000000011', member: { user: { id: member } }, type: 3,
    data: { component_type: 2, custom_id: `lobby:100000000000000009:${action}` } });
  const calls = () => fetchFn.mock.calls.map(call => [call[1].method, String(call[0]).replace(/^.*\/webhooks\/\d+\/fixture-token/, '')]);
  beforeEach(() => { vi.mocked(createLobby).mockResolvedValue(lobby); vi.mocked(loadLobby).mockResolvedValue(lobby); });

  it('acknowledges /모집 publicly, lobby edits as message updates, and lobby recommendations privately', async () => {
    const ack = async (value: unknown) => (await receiveInteraction(request(value), vi.fn(), env)).json();
    expect(await ack({ ...command(), data: { name: '모집', type: 1 } })).toEqual({ type: 5 });
    for (const action of ['join', 'leave', 'close']) expect(await ack({ ...command(), type: 3, data: { component_type: 2, custom_id: `lobby:${lobby.id}:${action}` } })).toEqual({ type: 6 });
    expect(await ack({ ...command(), type: 3, data: { component_type: 2, custom_id: `lobby:${lobby.id}:recommend` } })).toEqual({ type: 5, data: { flags: 64 } });
    expect(await ack(command())).toEqual({ type: 5, data: { flags: 64 } });
  });
  it('creates the lobby and posts it publicly without pinging anyone', async () => {
    await completeInteraction(lobbyCommand());
    expect(createLobby).toHaveBeenCalledWith({ id: '100000000000000009', ownerId: owner, game: 'Lethal', playTime: '오늘 10시', max: 4 });
    expect(calls()).toEqual([['PATCH', '/messages/@original']]);
    const message = lastMessage();
    expect(message.flags).toBeUndefined(); expect(message.allowed_mentions).toEqual({ parse: [] });
    expect(message.content).toContain('게임: Lethal · 시간: 오늘 10시 · 인원: 1/4명');
    expect(message.components[0].components.map((c: { custom_id: string }) => c.custom_id.split(':')[2])).toEqual(['join', 'leave', 'recommend', 'close']);
  });
  it('never posts a denial publicly: deletes the public placeholder and tells only the requester', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    await completeInteraction(lobbyCommand());
    expect(createLobby).not.toHaveBeenCalled();
    expect(calls()).toEqual([['DELETE', '/messages/@original'], ['POST', '']]);
    expect(lastMessage()).toMatchObject({ flags: 64 }); expect(lastMessage().content).toContain('차단');
  });
  it('edits the lobby message through the clicker’s token and only adds a private notice when something is refused', async () => {
    vi.mocked(lobbyAction).mockImplementation(async (_id, _user, _action, edit) => { await edit(privateMessage('edited')); return null; });
    await completeInteraction(lobbyButton('join'));
    expect(lobbyAction).toHaveBeenCalledWith(lobby.id, friend, 'join', expect.any(Function));
    expect(calls()).toEqual([['PATCH', '/messages/@original']]);
    fetchFn.mockClear();
    vi.mocked(lobbyAction).mockResolvedValue(privateMessage('인원이 다 찼어요.'));
    await completeInteraction(lobbyButton('join'));
    expect(calls()).toEqual([['POST', '']]); expect(lastMessage()).toMatchObject({ flags: 64, content: '인원이 다 찼어요.' });
  });
  it('recommends for the lobby members without a friend picker, only for members', async () => {
    await completeInteraction(lobbyButton('recommend'));
    expect(lastMessage().content).toContain('참여한 사람만');
    vi.mocked(loadLobby).mockResolvedValue({ ...lobby, memberIds: [owner, friend] });
    await completeInteraction(lobbyButton('recommend'));
    expect(saveParty).toHaveBeenCalledWith({ id: '100000000000000011', ownerId: friend, discordIds: [owner, friend], scope: 'all', preference: 'balanced' });
    expect(recommendGames).toHaveBeenCalledWith(steamIds, 'balanced', 'all');
    vi.mocked(hasSteamConsent).mockResolvedValue(false);
    await completeInteraction(lobbyButton('recommend'));
    expect(JSON.stringify(lastMessage().components)).toContain('steamconsent:accept');
  });
});

describe('readability and variety of recommendations', () => {
  const partyId = '100000000000000009';
  const party = { id: partyId, ownerId: owner, discordIds: [owner, friend], scope: 'all' as const, preference: 'balanced' as const };
  const games = Array.from({ length: 12 }, (_, i) => ({ ...result.games[0], appId: 100 + i, name: `Game ${i + 1}` }));
  const press = (customId: string, values?: string[]) => parsed({ ...command(), id: '100000000000000012', type: 3,
    data: values ? { component_type: 3, custom_id: customId, values } : { component_type: 2, custom_id: customId } });
  beforeEach(() => { vi.mocked(loadParty).mockResolvedValue(party); vi.mocked(recommendGames).mockResolvedValue({ ...result, games }); });

  it('suppresses Steam link previews and shows 5 of 12 with a page counter', async () => {
    await completeInteraction(parsed(component()));
    const message = lastMessage();
    expect(message.content).toContain('[Game 1](<https://store.steampowered.com/app/100/>)');
    expect(message.content).not.toMatch(/\]\(https?:/);
    expect(message.content).toContain('1~5 / 12'); expect(message.content).not.toContain('Game 6');
    expect(message.components[0].components[0]).toMatchObject({ label: '🔄 다른 추천', custom_id: `party:100000000000000009:more:5` });
    expect(message.components[1].components[0].options.find((o: { default: boolean }) => o.default).value).toBe('balanced');
  });
  it('pages in place (no new message) and wraps around', async () => {
    expect(await (await receiveInteraction(request({ ...command(), type: 3, data: { component_type: 2, custom_id: `party:${partyId}:more:5` } }), vi.fn(), env)).json()).toEqual({ type: 6 });
    await completeInteraction(press(`party:${partyId}:more:5`));
    expect(fetchFn.mock.calls.at(-1)![1].method).toBe('PATCH');
    expect(lastMessage().content).toContain('6~10 / 12'); expect(lastMessage().content).toContain('Game 6');
    await completeInteraction(press(`party:${partyId}:more:10`));
    expect(lastMessage().content).toContain('11~12 / 12');
    expect(lastMessage().components[0].components[0].custom_id).toBe(`party:${partyId}:more:0`);
  });
  it('changes the criterion in place and remembers it for the party', async () => {
    await completeInteraction(press(`party:${partyId}:pref`, ['recent']));
    expect(setPartyPreference).toHaveBeenCalledWith(partyId, owner, 'recent');
    expect(recommendGames).toHaveBeenLastCalledWith(steamIds, 'recent', 'all');
    expect(fetchFn.mock.calls.at(-1)![1].method).toBe('PATCH');
    expect(lastMessage().content).toContain('요즘 크루픽');
    expect(interactionSchema.safeParse({ ...command(), type: 3, data: { component_type: 3, custom_id: `party:${partyId}:pref`, values: ['bogus'] } }).success).toBe(false);
  });
  it('offers "지난번 멤버로" on the picker and reuses those friends with the newly chosen scope/criterion', async () => {
    vi.mocked(lastParty).mockResolvedValue(party);
    await completeInteraction(parsed({ ...command(), data: { name: '게임추천', type: 1, options: [{ name: '범위', type: 3, value: 'any' }, { name: '기준', type: 3, value: 'fresh' }] } }));
    expect(lastParty).toHaveBeenCalledWith(owner);
    const again = lastMessage().components[1].components[0];
    expect(again).toMatchObject({ label: '🔁 지난번 멤버로 (2명)', custom_id: `party:${partyId}:again:any:fresh` });
    await completeInteraction(press(again.custom_id));
    expect(saveParty).toHaveBeenLastCalledWith({ ...party, id: '100000000000000012', scope: 'any', preference: 'fresh' });
    expect(recommendGames).toHaveBeenLastCalledWith(steamIds, 'fresh', 'any');
    vi.mocked(lastParty).mockResolvedValue(null);
    await completeInteraction(parsed(command()));
    expect(lastMessage().components).toHaveLength(1);
  });
  it('shows an error ID (not the error text) when a command fails unexpectedly', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(recommendGames).mockRejectedValue(new Error('secret-upstream-detail'));
    await completeInteraction(parsed(component()));
    expect(lastMessage().content).toMatch(/오류 ID: [0-9a-f-]{36}/);
    expect(JSON.stringify(log.mock.calls)).toContain('api/discord.interaction');
    expect(JSON.stringify([log.mock.calls, lastMessage()])).not.toContain('secret-upstream-detail');
  });
});

describe('recruit from a recommendation', () => {
  const partyId = '100000000000000009';
  const party = { id: partyId, ownerId: owner, discordIds: [owner, friend, '100000000000000005'], scope: 'all' as const, preference: 'balanced' as const };
  const recruit = (value: string) => parsed({ ...command(), id: '100000000000000013', type: 3, data: { component_type: 3, custom_id: `party:${partyId}:recruit`, values: [value] } });
  beforeEach(() => { vi.mocked(loadParty).mockResolvedValue(party); });

  it('lists the shown games in a recruit menu', async () => {
    await completeInteraction(parsed(component()));
    const menu = lastMessage().components.at(-1).components[0];
    expect(menu).toMatchObject({ type: 3, custom_id: `party:100000000000000009:recruit` });
    expect(menu.options).toEqual([{ label: 'Game [safe]', value: 'Game [safe]' }]);
  });
  it('acknowledges publicly and opens a lobby for the chosen game sized to the party', async () => {
    expect(await (await receiveInteraction(request({ ...command(), type: 3, data: { component_type: 3, custom_id: `party:${partyId}:recruit`, values: ['Lethal'] } }), vi.fn(), env)).json()).toEqual({ type: 5 });
    vi.mocked(createLobby).mockImplementation(async lobby => ({ ...lobby, memberIds: [lobby.ownerId], closed: false, version: 1 }));
    await completeInteraction(recruit('Lethal'));
    expect(createLobby).toHaveBeenCalledWith({ id: '100000000000000013', ownerId: owner, game: 'Lethal', playTime: null, max: 3 });
    expect(fetchFn.mock.calls.at(-1)![1].method).toBe('PATCH');
    expect(lastMessage().flags).toBeUndefined();
    expect(lastMessage().content).toContain('게임: Lethal · 인원: 1/3명');
  });
  it('never posts publicly for an expired or foreign party', async () => {
    vi.mocked(loadParty).mockResolvedValue(null);
    await completeInteraction(recruit('Lethal'));
    expect(createLobby).not.toHaveBeenCalled();
    expect(fetchFn.mock.calls.map(call => call[1].method)).toEqual(['DELETE', 'POST']);
    expect(lastMessage()).toMatchObject({ flags: 64 });
  });
});

describe('멤버 의견 입력창 (intent/0002 R1·R2·R3·R8)', () => {
  const channel = '100000000000000080';
  const submit = (customId: string, value: string) => ({ ...command(), type: 5, channel_id: channel,
    data: { custom_id: customId, components: [{ type: 1, components: [{ type: 4, custom_id: 'body', value }] }] } });
  it('/의견은 DB 없이 바로 입력창을 연다', async () => {
    const defer = vi.fn();
    const body = await (await receiveInteraction(request({ ...command(), data: { name: '의견', type: 1 } }), defer, env)).json();
    expect(body).toMatchObject({ type: 9, data: { custom_id: 'feedback:cmd' } });
    expect(JSON.stringify(body)).toContain('"max_length":1000');
    expect(defer).not.toHaveBeenCalled();
    expect(commandAccess).not.toHaveBeenCalled();
  });
  it('메시지 우클릭은 메시지 위치만 담은 입력창을 연다(내용은 담지 않는다)', async () => {
    const defer = vi.fn();
    const payload = { ...command(), channel_id: channel, data: { name: '재순이에게 전달', type: 3, target_id: friend,
      resolved: { messages: { [friend]: { attachments: [], content: '비밀 원문' } } } } };
    const body = await (await receiveInteraction(request(payload), defer, env)).json();
    expect(body.data.custom_id).toBe(`feedback:msg:${channel}:${friend}`);
    expect(JSON.stringify(body)).not.toContain('비밀 원문');
    expect(defer).not.toHaveBeenCalled();
  });
  it('제출은 비공개 지연 응답 뒤 가입한 멤버의 의견만 저장하고 메시지 링크를 남긴다', async () => {
    const defer = vi.fn();
    const ack = await (await receiveInteraction(request(submit(`feedback:msg:${channel}:${friend}`, '  추천이 느려요  ')), defer, env)).json();
    expect(ack).toEqual({ type: 5, data: { flags: 64 } });
    vi.mocked(saveFeedback).mockResolvedValue('saved');
    await completeInteraction(parsed(submit(`feedback:msg:${channel}:${friend}`, '  추천이 느려요  ')));
    expect(saveFeedback).toHaveBeenCalledWith({ id: '100000000000000009', userId: 'user_owner', discordId: owner, body: '추천이 느려요',
      source: 'message', messageLink: `https://discord.com/channels/${guild}/${channel}/${friend}` });
    expect(lastMessage().content).toContain('재순이가 전달받았어요');
  });
  it('사이트 계정이 없어도 저장하고(intent/0004 R4), 차단된 계정은 저장하지 않고 쓴 글을 돌려준다', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'ok', userId: null });
    vi.mocked(saveFeedback).mockResolvedValue('saved');
    await completeInteraction(parsed(submit('feedback:cmd', '로그인 안 한 의견')));
    expect(saveFeedback).toHaveBeenCalledWith(expect.objectContaining({ userId: null, discordId: owner, body: '로그인 안 한 의견' }));
    expect(lastMessage().content).toContain('재순이가 전달받았어요');
    vi.mocked(saveFeedback).mockClear();
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    await completeInteraction(parsed(submit('feedback:cmd', '차단된 의견')));
    expect(saveFeedback).not.toHaveBeenCalled();
    expect(lastMessage().content).toContain('차단');
    expect(lastMessage().content).toContain('차단된 의견');
  });
  it('하루 한도를 넘으면 알리고, 저장 실패는 원문 없이 오류 ID로 알린다', async () => {
    vi.mocked(saveFeedback).mockResolvedValueOnce('limited');
    await completeInteraction(parsed(submit('feedback:cmd', '여섯 번째')));
    expect(lastMessage().content).toContain('잠시 뒤에');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(saveFeedback).mockRejectedValueOnce(new Error('db down'));
    await completeInteraction(parsed(submit('feedback:cmd', '실패할 의견 원문')));
    expect(lastMessage().content).toContain('오류 ID');
    expect(JSON.stringify(log.mock.calls)).not.toContain('실패할 의견 원문');
  });
  it('빈 글·1000자 초과·모르는 입력창은 거부한다', () => {
    expect(interactionSchema.safeParse(submit('feedback:cmd', '   ')).success).toBe(false);
    expect(interactionSchema.safeParse(submit('feedback:cmd', 'a'.repeat(1001))).success).toBe(false);
    expect(interactionSchema.safeParse(submit('other:cmd', '의견')).success).toBe(false);
  });
});

describe('디스코드 사용량 기록 (intent/0003 R1·R4·R5)', () => {
  it('응답을 보낸 뒤 기능 이름·누른 사람·처리 시간을 한 번 기록한다', async () => {
    vi.mocked(recordUsage).mockResolvedValue(undefined);
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith('/패치노트', owner, expect.any(Number));
    expect(fetchFn.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(recordUsage).mock.invocationCallOrder[0]);
  });
  it('차단 안내로 끝난 요청도 시도로 센다', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    await completeInteraction(parsed({ ...command(), data: { name: '기록', type: 1 } }));
    expect(recordUsage).toHaveBeenCalledWith('/기록', owner, expect.any(Number));
  });
  it('기록이 실패해도 응답은 이미 보냈고 실패만 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(recordUsage).mockRejectedValue(new Error('db down'));
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(fetchFn).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain('api/discord.usage');
  });
  it('입력창을 여는 첫 응답은 세지 않는다(첫 응답 전 DB 없음)', async () => {
    const defer = vi.fn();
    await receiveInteraction(request({ ...command(), data: { name: '의견', type: 1 } }), defer, env);
    expect(defer).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });
});

describe('의견 제출의 예외 경로', () => {
  const channel = '100000000000000080';
  const submit = (value: string) => ({ ...command(), type: 5, channel_id: channel,
    data: { custom_id: 'feedback:cmd', components: [{ type: 1, components: [{ type: 4, custom_id: 'body', value }] }] } });
  it('줄이 많은 1000자 의견을 돌려줄 때도 디스코드 한도(2000자)를 넘지 않고 글을 모두 담는다', async () => {
    vi.mocked(saveFeedback).mockRejectedValue(new Error('db down')); vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = Array.from({ length: 499 }, (_, i) => String(i % 10)).join('\n');
    expect(body.length).toBeLessThanOrEqual(1000);
    await completeInteraction(parsed(submit(body)));
    const content = lastMessage().content as string;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain(body);
  });
  it('가입 확인 중 오류가 나도 쓴 글을 돌려주고 의견 실패로 기록한다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(commandAccess).mockRejectedValue(new Error('db down'));
    await completeInteraction(parsed(submit('사라지면 안 되는 의견')));
    expect(saveFeedback).not.toHaveBeenCalled();
    expect(lastMessage().content).toContain('사라지면 안 되는 의견');
    expect(lastMessage().content).toContain('오류 ID');
    expect(JSON.stringify(log.mock.calls)).toContain('api/discord.feedback');
    expect(JSON.stringify(log.mock.calls)).not.toContain('사라지면 안 되는 의견');
  });
});

describe('사이트 계정 없이 디스코드에서 바로 쓰기 (intent/0004 R1·R2)', () => {
  beforeEach(() => { vi.mocked(commandAccess).mockResolvedValue({ kind: 'ok', userId: null }); });
  it('계정이 필요 없는 명령은 로그인 안내 없이 처리한다', async () => {
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(lastMessage().content).toContain('패치노트');
    expect(lastMessage().content).not.toContain('Steam을 연결해'); expect(lastMessage().content).not.toContain('차단');
    vi.mocked(createLobby).mockResolvedValue({ id: '100000000000000009', ownerId: owner, game: null, playTime: null, max: null, memberIds: [owner], closed: false, version: 1 });
    await completeInteraction(parsed({ ...command(), data: { name: '모집', type: 1 } }));
    expect(createLobby).toHaveBeenCalled();
  });
  it('게임추천 명령·버튼은 Steam 연결용 로그인 안내만 하고 Steam을 조회하지 않는다', async () => {
    for (const value of [command(), component()]) {
      await completeInteraction(parsed(value));
      expect(lastMessage().content).toContain('로그인');
      expect(lastMessage().content).toContain('Steam');
    }
    expect(hasSteamConsent).not.toHaveBeenCalled(); expect(linkedPlayers).not.toHaveBeenCalled(); expect(recommendGames).not.toHaveBeenCalled();
  });
});

describe('사용 역할 (intent/0004 R8)', () => {
  const role = '100000000000000500';
  it('역할이 없으면 명령·의견을 처리하지 않고 필요한 역할을 알림 없는 멘션으로 알린다', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'no_role', roleId: role });
    await completeInteraction(parsed({ ...command(), data: { name: '기록', type: 1 } }));
    expect(lastMessage().content).toContain(`<@&${role}>`);
    expect(lastMessage().allowed_mentions).toEqual({ parse: [] });
    await completeInteraction(parsed({ ...command(), type: 5, data: { custom_id: 'feedback:cmd', components: [{ type: 1, components: [{ type: 4, custom_id: 'body', value: '역할 없는 의견' }] }] } }));
    expect(saveFeedback).not.toHaveBeenCalled();
    expect(lastMessage().content).toContain(`<@&${role}>`);
    expect(lastMessage().content).toContain('역할 없는 의견');
  });
  it('서명된 역할·권한을 그대로 접근 확인에 넘긴다', async () => {
    await completeInteraction(parsed({ ...command(), member: { user: { id: owner }, roles: [role], permissions: '0' }, data: { name: '패치노트', type: 1 } }));
    expect(commandAccess).toHaveBeenCalledWith({ user: { id: owner }, roles: [role], permissions: '0' });
  });
  it('역할 목록 형식이 잘못된 요청은 거부한다', async () => {
    const defer = vi.fn();
    expect((await receiveInteraction(request({ ...command(), member: { user: { id: owner }, roles: ['nope'] } }), defer, env)).status).toBe(400);
    expect(defer).not.toHaveBeenCalled();
  });
  it('관리자는 /운영 사용역할로 역할을 정하고 비울 수 있다', async () => {
    const actor = { id: 'user_owner', name: 'Owner' };
    vi.mocked(adminUser).mockResolvedValue(actor);
    vi.mocked(adminTask).mockResolvedValue(privateMessage('done'));
    await completeInteraction(parsed({ ...command(), member: { user: { id: owner }, permissions: '8' },
      data: { name: '운영', type: 1, options: [{ name: '사용역할', type: 1, options: [{ name: '역할', type: 8, value: role }] }] } }));
    await completeInteraction(parsed({ ...command(), member: { user: { id: owner }, permissions: '8' },
      data: { name: '운영', type: 1, options: [{ name: '사용역할', type: 1 }] } }));
    expect(vi.mocked(adminTask).mock.calls).toEqual([['사용역할', actor, role], ['사용역할', actor, undefined]]);
  });
});

describe('막힌 이유 집계 (2번)', () => {
  const sent = () => fetchFn.mock.calls.map(call => String(call[1]?.body ?? ''));
  it.each([
    ['차단', { kind: 'banned' } as const, 'banned'],
    ['역할 없음', { kind: 'no_role', roleId: '100000000000000500' } as const, 'no_role'],
    ['사이트 계정 없이 게임추천', { kind: 'ok', userId: null } as const, 'steam_login'],
  ])('%s → 이유를 세고 Discord로는 이유를 보내지 않는다', async (_name, access, reason) => {
    vi.mocked(commandAccess).mockResolvedValue(access);
    await completeInteraction(parsed(command()));
    expect(recordBlock).toHaveBeenCalledWith(reason, owner);
    expect(sent().join('')).not.toContain('"block"');
  });
  it('Steam 동의가 없거나 고른 친구가 연결되지 않았으면 그 이유를 센다', async () => {
    vi.mocked(hasSteamConsent).mockResolvedValue(false);
    await completeInteraction(parsed(command()));
    expect(recordBlock).toHaveBeenLastCalledWith('steam_consent', owner);
    vi.mocked(hasSteamConsent).mockResolvedValue(true);
    vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }]);
    await completeInteraction(parsed(component()));
    expect(recordBlock).toHaveBeenLastCalledWith('friend_unlinked', owner);
    expect(sent().join('')).not.toContain('"block"');
  });
  it('정상 응답은 막힘으로 세지 않고, 집계가 실패해도 응답은 그대로다', async () => {
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(recordBlock).not.toHaveBeenCalled();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(recordBlock).mockRejectedValue(new Error('db down'));
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'banned' });
    await completeInteraction(parsed(command()));
    expect(lastMessage().content).toContain('차단');
  });
});

describe('게임추천 준비를 디스코드에서 (intent/0005)', () => {
  const buttons = (message: { components?: { components: { type: number; style?: number; url?: string; custom_id?: string; label?: string }[] }[] }) =>
    (message.components ?? []).flatMap(row => row.components);
  const click = (custom_id: string) => parsed({ ...command(), id: '100000000000000012', type: 3, data: { component_type: 2, custom_id } });
  it('R1: 사이트 계정이 없으면 /connect/steam 링크 버튼을 붙인다', async () => {
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'ok', userId: null });
    await completeInteraction(parsed(command()));
    expect(buttons(lastMessage())).toContainEqual(expect.objectContaining({ type: 2, style: 5, url: 'https://www.jaemangho.shop/connect/steam' }));
  });
  it('R4: 동의만 없으면 웹과 같은 고지와 동의 버튼을 보이고, 누르면 저장한 뒤 바로 친구 선택창을 연다', async () => {
    vi.mocked(hasSteamConsent).mockResolvedValue(false);
    await completeInteraction(parsed(command()));
    expect(lastMessage().content).toContain('Steam 공통 게임 이용 동의');
    expect(lastMessage().content).toContain('사용하는 데이터');
    expect(lastMessage().content).toContain('저장 국가');
    expect(buttons(lastMessage()).map(b => b.custom_id)).toContain('steamconsent:accept');
    vi.mocked(acceptSteamConsent).mockResolvedValue([]);
    await completeInteraction(click('steamconsent:accept'));
    expect(acceptSteamConsent).toHaveBeenCalledWith('user_owner', 'steam-common-v1');
    expect(lastMessage().content).toContain('동의했어요');
    expect(JSON.stringify(lastMessage().components)).toContain(`steamrec:v2:${owner}:all:balanced:`);
  });
  it('R4: 디스코드에서 동의해도 웹처럼 확인된 내 계정의 첫 기록을 준비하고, 준비가 실패해도 선택창은 연다', async () => {
    vi.mocked(acceptSteamConsent).mockResolvedValue([steamIds[0]]);
    await completeInteraction(click('steamconsent:accept'));
    expect(runSteamCollection).toHaveBeenCalledWith('manual', { steamIds: [steamIds[0]], budgetMs: 10_000 });
    expect(JSON.stringify(lastMessage().components)).toContain('steamrec:v2');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runSteamCollection).mockRejectedValue(new Error('steam down'));
    await completeInteraction(click('steamconsent:accept'));
    expect(JSON.stringify(lastMessage().components)).toContain('steamrec:v2');
    vi.mocked(runSteamCollection).mockClear(); vi.mocked(acceptSteamConsent).mockResolvedValue([]);
    await completeInteraction(click('steamconsent:accept'));
    expect(runSteamCollection).not.toHaveBeenCalled();
  });
  it('R4: 저장 국가가 정해지지 않아 동의를 저장할 수 없으면 웹으로 안내하고, 계정이 없으면 연결 화면으로 보낸다', async () => {
    vi.mocked(acceptSteamConsent).mockRejectedValue(new Error('steam_notice_changed'));
    await completeInteraction(click('steamconsent:accept'));
    expect(lastMessage().content).toContain('사이트');
    expect(JSON.stringify(lastMessage().components ?? [])).not.toContain('steamrec');
    vi.mocked(commandAccess).mockResolvedValue({ kind: 'ok', userId: null });
    vi.mocked(acceptSteamConsent).mockClear();
    await completeInteraction(click('steamconsent:accept'));
    expect(acceptSteamConsent).not.toHaveBeenCalled();
    expect(buttons(lastMessage())).toContainEqual(expect.objectContaining({ url: 'https://www.jaemangho.shop/connect/steam' }));
  });
  it('R5: 연결 안 된 친구가 있으면 알림 버튼을 붙이고, 누르면 그 친구만 멘션하는 공개 메시지를 올린다', async () => {
    vi.mocked(linkedPlayers).mockResolvedValue([{ discordId: owner, steamId: steamIds[0] }]);
    await completeInteraction(parsed(component()));
    const nudge = buttons(lastMessage()).find(b => b.custom_id?.startsWith('nudge:'));
    expect(nudge?.custom_id).toBe(`nudge:${friend}`);
    const defer = vi.fn();
    expect(await (await receiveInteraction(request(click(nudge!.custom_id!)), defer, env)).json()).toEqual({ type: 5 });
    vi.mocked(claimNudges).mockImplementation(async ids => ids);
    await completeInteraction(click(nudge!.custom_id!));
    expect(claimNudges).toHaveBeenCalledWith([friend]);
    const message = lastMessage();
    expect(message.flags).toBeUndefined();
    expect(message.content).toContain(`<@${friend}>`);
    expect(message.allowed_mentions).toEqual({ parse: [], users: [friend] });
    expect(buttons(message)).toContainEqual(expect.objectContaining({ style: 5, url: 'https://www.jaemangho.shop/connect/steam' }));
  });
  it('R5: 6시간 안에 이미 알린 친구에게는 다시 알리지 않고, 남은 친구가 없으면 본인에게만 알린다', async () => {
    const other = '100000000000000005';
    vi.mocked(claimNudges).mockResolvedValue([other]);
    await completeInteraction(click(`nudge:${friend}.${other}`));
    expect(lastMessage().content).toContain(`<@${other}>`); expect(lastMessage().content).not.toContain(`<@${friend}>`);
    expect(lastMessage().allowed_mentions).toEqual({ parse: [], users: [other] });
    vi.mocked(claimNudges).mockResolvedValue([]);
    await completeInteraction(click(`nudge:${friend}`));
    expect(lastMessage().flags).toBe(64);
    expect(lastMessage().content).toContain('6시간');
  });
  it('R5: 알림 버튼에는 100자 안에 들어가는 친구만 담고, 잘못된 형식은 거부한다', async () => {
    const many = Array.from({ length: 8 }, (_, i) => `1000000000000001${String(i).padStart(2, '0')}`);
    vi.mocked(linkedPlayers).mockResolvedValue([]);
    await completeInteraction(parsed({ ...component(), data: { ...component().data, values: [owner, ...many] } }));
    const nudge = buttons(lastMessage()).find(b => b.custom_id?.startsWith('nudge:'))!;
    expect(nudge.custom_id!.length).toBeLessThanOrEqual(100);
    for (const bad of ['nudge:', 'nudge:abc', `nudge:${friend}.${friend}`]) {
      expect(interactionSchema.safeParse({ ...command(), type: 3, data: { component_type: 2, custom_id: bad } }).success).toBe(false);
    }
  });
});
