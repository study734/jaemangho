import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canUseCommand, linkedPlayers } from './access';
import { recommendGames, type RecommendationsResult } from '../steam/recommendations';
import { completeInteraction, editReply, receiveInteraction } from './handler';
import { friendPicker, interactionSchema, privateMessage, type Interaction } from './protocol';

vi.mock('./access', () => ({ canUseCommand: vi.fn(), linkedPlayers: vi.fn() }));
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
  vi.mocked(canUseCommand).mockResolvedValue(true);
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
    expect(canUseCommand).not.toHaveBeenCalled(); expect(defer).not.toHaveBeenCalled();
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
    expect(canUseCommand).not.toHaveBeenCalled(); expect(recommendGames).not.toHaveBeenCalled();
    await deferred[0]();
    expect(canUseCommand).toHaveBeenCalledWith(owner);
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
    expect(defer).not.toHaveBeenCalled(); expect(canUseCommand).not.toHaveBeenCalled();
  });
});

describe('message command 출처 찾기', () => {
  const sourceCommand = (attachments: unknown[]) => parsed({ ...command(), data: { name: '출처 찾기', type: 3, target_id: friend,
    resolved: { messages: { [friend]: { attachments } } } } });
  it('is gated by the same account check and never starts a lookup for a denied requester', async () => {
    vi.mocked(canUseCommand).mockResolvedValue(false);
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
    vi.mocked(canUseCommand).mockResolvedValue(false);
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
    await completeInteraction(parsed(component())); expect(lastMessage().content).toContain('계정 연결');
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
    expect(lastMessage().content).toContain('보유 목록에 없음');
    expect(lastMessage().content.length).toBeLessThanOrEqual(2000);
    expect(lastMessage().content).not.toContain('/app/6/');
  });
  it('answers slow work at 45 seconds and does not later send a stale success', async () => {
    vi.useFakeTimers();
    let release!: (allowed: boolean) => void;
    vi.mocked(canUseCommand).mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = completeInteraction(parsed(command()));
    await vi.advanceTimersByTimeAsync(45_000); await pending;
    expect(lastMessage().content).toContain('조회 시간이 길어');
    release(true); await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
  it('returns a usable picker without storing state or needing a fixed roster list', () => {
    expect(JSON.stringify(friendPicker(owner, 'any'))).toContain(`steamrec:v1:${owner}:any:`);
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
    vi.mocked(canUseCommand).mockResolvedValue(true);
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(lastMessage().content).toContain('출처 찾기');
    expect(lastMessage().content).not.toContain('디스코드 위젯');
    vi.mocked(canUseCommand).mockResolvedValue(false);
    await completeInteraction(parsed({ ...command(), data: { name: '패치노트', type: 1 } }));
    expect(lastMessage().content).toContain('차단');
  });
});
