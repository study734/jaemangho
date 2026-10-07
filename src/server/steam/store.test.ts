import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { steamCacheGet, steamCachePut } from './cache';
import { getPlaySupport, supportFromCategories } from './store';

vi.mock('./cache', () => ({ steamCacheGet: vi.fn(), steamCachePut: vi.fn(), steamStat: vi.fn() }));
const fetchMock = vi.fn();
const reply = (appId: number, categories: number[], type = 'game') => new Response(JSON.stringify({
  [appId]: { success: true, data: { type, steam_appid: appId, categories: categories.map(id => ({ id })) } },
}));
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Steam 스토어 지원 방식', () => {
  it('온라인 협동/PvP와 같은 화면 전용을 구분한다', () => {
    expect(supportFromCategories([2, 38, 39])).toBe('coop');
    expect(supportFromCategories([1, 36, 24])).toBe('multiplayer');
    expect(supportFromCategories([1, 9, 24, 39, 44])).toBe('local');
    expect(supportFromCategories([9])).toBe('coop');
    expect(supportFromCategories([1])).toBe('multiplayer');
    expect(supportFromCategories([2, 22])).toBe('single');
  });
  it('성공한 지원 방식만 기존 캐시에 하루 저장한다', async () => {
    fetchMock.mockResolvedValue(reply(620, [38]));
    expect(await getPlaySupport(620)).toBe('coop');
    expect(steamCachePut).toHaveBeenCalledWith('store:play-support:v1:620', 'coop', 86400);
    expect(fetchMock.mock.calls[0][0]).toContain('appids=620');
  });
  it('동시 요청은 합치고 검증된 캐시가 있으면 외부 호출을 하지 않는다', async () => {
    fetchMock.mockResolvedValue(reply(730, [36]));
    expect(await Promise.all([getPlaySupport(730), getPlaySupport(730)])).toEqual(['multiplayer', 'multiplayer']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.mocked(steamCacheGet).mockResolvedValue('multiplayer');
    await getPlaySupport(730);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500])('스토어 %i 응답은 미확인이고 캐시하지 않는다', async status => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    expect(await getPlaySupport(1)).toBe('unknown');
    expect(steamCachePut).not.toHaveBeenCalled();
    await getPlaySupport(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    { '1': { success: false } },
    { '1': { success: true, data: { type: 'game', steam_appid: 1 } } },
    { '1': { success: true, data: { type: 'game', steam_appid: 2, categories: [{ id: 38 }] } } },
  ])('깨진 응답이나 다른 appId는 추측하지 않는다', async body => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    expect(await getPlaySupport(1)).toBe('unknown');
    expect(steamCachePut).not.toHaveBeenCalled();
  });
  it('네트워크 실패는 미확인, DLC는 추천 대상이 아니다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect(await getPlaySupport(1)).toBe('unknown');
    fetchMock.mockResolvedValue(reply(1, [38], 'dlc'));
    expect(await getPlaySupport(1)).toBe('single');
  });
});
