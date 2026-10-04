import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamNotConfiguredError, getLibrary, parseSteamInput, resolveSteamId } from './client';

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
