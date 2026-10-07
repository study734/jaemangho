import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamNotConfiguredError, getRecentGames, getAchievementDefinitions, getAchievementProgress, getLibrary, parseSteamInput, resolveSteamId } from './client';

import { steamCacheGet, steamCachePut } from './cache';
vi.mock('./cache', () => ({ steamCacheGet: vi.fn(), steamCachePut: vi.fn(), steamStat: vi.fn() }));

describe('parseSteamInput', () => {
  it.each([
    ['76561198000000000', { kind: 'id', steamId: '76561198000000000' }],
    ['https://steamcommunity.com/profiles/76561198000000000/', { kind: 'id', steamId: '76561198000000000' }],
    ['steamcommunity.com/id/my-name', { kind: 'vanity', vanity: 'my-name' }],
    ['my_name', { kind: 'vanity', vanity: 'my_name' }],
  ])('%s', (raw, expected) => expect(parseSteamInput(raw)).toEqual(expected));

  it.each(['', 'a', 'https://evil.example/id/x', 'steamcommunity.com/profiles/abc', 'a b', 'x'.repeat(40)])('거부: %j', (raw) =>
    expect(parseSteamInput(raw)).toBeNull()
  );
});

describe('Steam 호출', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.mocked(steamCacheGet).mockReset();
    vi.mocked(steamCachePut).mockReset();
    process.env.STEAM_API_KEY = 'k'.repeat(32);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STEAM_API_KEY;
  });
  const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('키가 없으면 호출하지 않고 SteamNotConfiguredError', async () => {
    delete process.env.STEAM_API_KEY;
    await expect(getLibrary('76561198000000000')).rejects.toBeInstanceOf(SteamNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('게임 목록이 없는 응답은 비공개로 본다', async () => {
    reply({ response: {} });
    expect(await getLibrary('76561198000000000')).toEqual({ ok: false });
  });
  it('게임 목록을 변환한다', async () => {
    reply({ response: { games: [{ appid: 10, name: 'CS', playtime_forever: 5 }] } });
    expect(await getLibrary('76561198000000000')).toEqual({ ok: true, games: [{ appId: 10, name: 'CS', minutes: 5 }] });
  });
  it('이름이 없는 vanity는 null', async () => {
    reply({ response: { success: 42 } });
    expect(await resolveSteamId({ kind: 'vanity', vanity: 'nobody' })).toBeNull();
  });
});

describe('Steam 최근 플레이와 도전 과제', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); vi.stubEnv('STEAM_API_KEY', 'test-only'); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const reply = (body: unknown) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
  it('확인된 빈 최근 기록과 비공개·깨진 기록을 구분한다', async () => {
    reply({ response: { total_count: 0 } });
    expect(await getRecentGames('a')).toEqual({ ok: true, games: [] });
    reply({ response: {} });
    expect(await getRecentGames('a')).toEqual({ ok: false });
    reply({ response: { games: [{ appid: 1, playtime_2weeks: -1 }] } });
    await expect(getRecentGames('a')).rejects.toThrow('schema mismatch');
  });
  it('최근 기록은 5분, 과제 정의는 하루 캐시하며 숨김은 보수적으로 처리한다', async () => {
    reply({ response: { games: [{ appid: 1, playtime_2weeks: 50 }] } });
    expect(await getRecentGames('a')).toEqual({ ok: true, games: [{ appId: 1, minutes: 50 }] });
    expect(steamCachePut).toHaveBeenLastCalledWith(expect.any(String), expect.any(Object), 300);
    reply({ game: { availableGameStats: { achievements: [
      { name: 'a', displayName: 'A', hidden: 0 }, { name: 'b', displayName: 'B', hidden: 1 }, { name: 'c', displayName: 'C' },
    ] } } });
    expect((await getAchievementDefinitions(1)).map(d => d.hidden)).toEqual([false, true, true]);
    expect(steamCachePut).toHaveBeenLastCalledWith(expect.any(String), expect.any(Object), 86400);
  });
  it('진행도 실패는 캐시하지 않고 오래된 실패 캐시도 다시 조회한다', async () => {
    vi.mocked(steamCacheGet).mockResolvedValue({ playerstats: { success: false } });
    reply({ playerstats: { success: false } });
    expect(await getAchievementProgress('a', 1)).toEqual({ ok: false });
    expect(steamCachePut).not.toHaveBeenCalled();
    reply({ playerstats: { success: true, achievements: [{ apiname: 'a', achieved: 1 }] } });
    expect(await getAchievementProgress('a', 1)).toEqual({ ok: true, achievements: [{ id: 'a', unlocked: true }] });
    expect(steamCachePut).toHaveBeenLastCalledWith(expect.any(String), expect.any(Object), 900);
  });
});
