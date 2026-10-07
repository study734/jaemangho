import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { steamCacheGet, steamCachePut } from './cache';
import { SteamUpstreamError } from './client';
import { getDiscoveryGames } from './discovery';

vi.mock('./cache', () => ({ steamCacheGet: vi.fn(), steamCachePut: vi.fn(), steamStat: vi.fn() }));
const fetchMock = vi.fn();
const body = { status: 1, top_sellers: { items: [{ id: 9, name: 'popular' }] }, new_releases: { items: [{ id: 9, name: 'popular' }, { id: 8, name: 'new' }] },
  coming_soon: { items: [{ id: 7, name: 'unreleased' }] } };
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('Steam 공개 인기·신규 목록', () => {
  it('중복을 제거하고 출시 예정은 포함하지 않으며 성공한 후보만 15분 캐시한다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    const games = await getDiscoveryGames();
    expect(games).toEqual([{ appId: 9, name: 'popular' }, { appId: 8, name: 'new' }]);
    expect(steamCachePut).toHaveBeenCalledWith('store:discovery:kr:v1', games, 900);
  });
  it('동시 요청을 합치고 캐시를 재사용한다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    await Promise.all([getDiscoveryGames(), getDiscoveryGames()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.mocked(steamCacheGet).mockResolvedValue([{ appId: 1, name: 'cached' }]);
    expect(await getDiscoveryGames()).toEqual([{ appId: 1, name: 'cached' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500])('스토어 %i는 정상적인 빈 결과로 숨기지 않고 재시도한다', async status => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(getDiscoveryGames()).rejects.toBeInstanceOf(SteamUpstreamError);
    await expect(getDiscoveryGames()).rejects.toBeInstanceOf(SteamUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(steamCachePut).not.toHaveBeenCalled();
  });
  it.each([{}, { top_sellers: { items: [] } }, { ...body, status: 0 }, { ...body, new_releases: { items: [{ id: '8', name: 'bad' }] } }])('응답 형식 오류도 실패로 처리한다', async payload => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(getDiscoveryGames()).rejects.toBeInstanceOf(SteamUpstreamError);
    expect(steamCachePut).not.toHaveBeenCalled();
  });
  it('네트워크 실패는 외부 오류로 변환하고 완전한 빈 목록은 허용한다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(getDiscoveryGames()).rejects.toBeInstanceOf(SteamUpstreamError);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 1, top_sellers: { items: [] }, new_releases: { items: [] } })));
    expect(await getDiscoveryGames()).toEqual([]);
  });
});
