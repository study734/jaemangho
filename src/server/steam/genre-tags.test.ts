import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { genreTags } from './genre-tags';
import { steamCacheGet, steamCachePut } from './cache';
vi.mock('./cache', () => ({ steamCacheGet: vi.fn(), steamCachePut: vi.fn(), steamStat: vi.fn() }));
const fetchMock = vi.fn();
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('bounded played-game genre metadata', () => {
  it('reuses source-checked mechanics locally without an external request', async () => {
    expect(await genreTags(620)).toContain('puzzle'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('deduplicates requests and caches only validated coarse genre data', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ '100': { success: true, data: { type: 'game', steam_appid: 100, genres: [{ id: '1' }, { id: '23' }, { id: '2' }] } } })));
    expect(await Promise.all([genreTags(100), genreTags(100)])).toEqual([['action', 'strategy'], ['action', 'strategy']]);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(steamCachePut).toHaveBeenCalledWith('store:taste-genres:v1:100', ['action', 'strategy'], 86400);
    vi.mocked(steamCacheGet).mockResolvedValue(['rpg']);
    expect(await genreTags(100)).toEqual(['rpg']); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not cache provider errors or incorrect app identities as missing genres', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ '101': { success: true, data: { type: 'game', steam_appid: 102, genres: [] } } })));
    expect(await genreTags(101)).toBeNull(); expect(await genreTags(101)).toBeNull(); expect(steamCachePut).not.toHaveBeenCalled();
  });
});
