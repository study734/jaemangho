import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { genreTags } from './genre-tags';
import { steamCacheGet, steamCachePut, steamStat } from './cache';
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
  it('실패 원인을 store.ts와 같은 코드로 나눠 기록한다(내려간 앱·게임 아닌 앱은 app_unavailable)', async () => {
    const entry = (appId: number, value: unknown) => new Response(JSON.stringify({ [appId]: value }));
    const cases: [number, () => Promise<Response>, string][] = [
      [201, async () => new Response('{}', { status: 503 }), 'http_503'],
      [202, async () => new Response('not json'), 'invalid_response'],
      [203, async () => entry(203, { success: false }), 'app_unavailable'],
      [204, async () => entry(204, { success: true, data: { type: 'dlc', steam_appid: 204 } }), 'app_unavailable'],
      [205, async () => entry(205, { success: true, data: { type: 'game', steam_appid: 999 } }), 'invalid_response'],
      [206, async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }, 'timeout'],
      [207, async () => { throw new TypeError('fetch failed'); }, 'network'],
    ];
    for (const [appId, respond, code] of cases) {
      fetchMock.mockImplementationOnce(respond);
      expect(await genreTags(appId)).toBeNull();
      expect(steamStat).toHaveBeenLastCalledWith('error', `store/taste-genres/${appId}`, code);
    }
    expect(steamCachePut).not.toHaveBeenCalled();
  });
});
