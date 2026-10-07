import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLibrary } from './client';
import { registeredIds } from './roster';
import { getPlaySupport } from './store';
import { getDiscoveryGames } from './discovery';
import { CANDIDATE_LIMIT, recommendGames, recommendationsQuerySchema } from './recommendations';

vi.mock('./client', () => ({ getLibrary: vi.fn() }));
vi.mock('./roster', async importOriginal => {
  const original = await importOriginal<typeof import('./roster')>();
  return { ...original, registeredIds: vi.fn() };
});
vi.mock('./store', () => ({ getPlaySupport: vi.fn() }));
vi.mock('./discovery', () => ({ getDiscoveryGames: vi.fn() }));
const ids = ['76561190000000001', '76561190000000002'];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(registeredIds).mockResolvedValue(ids);
  vi.mocked(getPlaySupport).mockResolvedValue('coop');
});
describe('Steam 추천 서비스', () => {
  it('중복 제외 후 2~20명과 알려진 기준만 허용한다', () => {
    expect(recommendationsQuerySchema.safeParse({ ids: ids.join(',') }).success).toBe(true);
    expect(recommendationsQuerySchema.parse({ ids: ids.join(',') }).scope).toBe('all');
    for (const scope of ['all', 'any', 'unowned']) expect(recommendationsQuerySchema.safeParse({ ids: ids.join(','), scope }).success).toBe(true);
    expect(recommendationsQuerySchema.safeParse({ ids: ids.join(','), scope: 'invalid' }).success).toBe(false);
    expect(recommendationsQuerySchema.safeParse({ ids: [ids[0], ids[0]].join(',') }).success).toBe(false);
    expect(recommendationsQuerySchema.safeParse({ ids: [...ids, ids[0]].join(',') }).data?.ids).toEqual(ids);
    expect(recommendationsQuerySchema.safeParse({ ids: 'not-a-steamid' }).success).toBe(false);
    expect(recommendationsQuerySchema.safeParse({ ids: ids.join(','), preference: 'unknown' }).success).toBe(false);
    expect(recommendationsQuerySchema.safeParse({ ids: Array(21).fill(ids[0]).join(',') }).success).toBe(false);
  });
  it('등록되지 않은 사람은 Steam 요청 전에 거부한다', async () => {
    vi.mocked(registeredIds).mockResolvedValue([ids[0]]);
    expect(await recommendGames(ids, 'balanced')).toEqual({ unknownIds: [ids[1]] });
    expect(getLibrary).not.toHaveBeenCalled();
  });
  it('한 사람이라도 목록이 비공개면 전원 보유라고 추천하지 않는다', async () => {
    vi.mocked(getLibrary).mockResolvedValueOnce({ ok: true, games: [{ appId: 1, name: 'one', minutes: 60 }] }).mockResolvedValueOnce({ ok: false });
    expect(await recommendGames(ids, 'balanced')).toMatchObject({ games: [], excluded: [ids[1]], checked: 0 });
    expect(getPlaySupport).not.toHaveBeenCalled();
  });
  it('지원이 검증된 후보만 반환하고 실패한 스토어 정보를 따로 센다', async () => {
    vi.mocked(getLibrary).mockResolvedValue({ ok: true, games: [1, 2, 3, 4].map(appId => ({ appId, name: `g${appId}`, minutes: 60 })) });
    vi.mocked(getPlaySupport).mockImplementation(async appId => ({ 1: 'single', 2: 'unknown', 3: 'coop', 4: 'local' } as const)[appId as 1 | 2 | 3 | 4]);
    const result = await recommendGames(ids, 'balanced');
    expect(result).toMatchObject({ totalCommon: 4, checked: 4, unverified: 1, games: [{ appId: 3, support: 'coop' }] });
  });
  it('외부 호출 범위와 결과 개수를 제한하고 처리 완료 순서에 흔들리지 않는다', async () => {
    vi.mocked(getLibrary).mockResolvedValue({ ok: true, games: Array.from({ length: 50 }, (_, i) => ({ appId: i + 1, name: `g${i}`, minutes: 60 })) });
    const result = await recommendGames(ids, 'balanced');
    expect(result).toMatchObject({ totalCommon: 50, checked: CANDIDATE_LIMIT });
    expect(getPlaySupport).toHaveBeenCalledTimes(CANDIDATE_LIMIT);
    if ('games' in result) expect(result.games.map(g => g.appId)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
  it('일부 보유 게임에 미보유 멤버를 연결하고 공개 후보 목록은 호출하지 않는다', async () => {
    vi.mocked(getLibrary).mockResolvedValueOnce({ ok: true, games: [{ appId: 1, name: 'one', minutes: 480 }] })
      .mockResolvedValueOnce({ ok: true, games: [{ appId: 2, name: 'two', minutes: 480 }] });
    const result = await recommendGames(ids, 'balanced', 'any');
    expect(result).toMatchObject({ totalCommon: 0, totalCandidates: 2,
      games: [{ appId: 1, owners: 1, missingIds: [ids[1]] }, { appId: 2, owners: 1, missingIds: [ids[0]] }] });
    expect(getDiscoveryGames).not.toHaveBeenCalled();
    if ('games' in result) expect(result.games[0]).not.toHaveProperty('ownerIndexes');
  });
  it('미보유 추천은 어느 멤버라도 가진 게임을 빼고 점수를 표시하지 않는다', async () => {
    vi.mocked(getLibrary).mockResolvedValueOnce({ ok: true, games: [{ appId: 1, name: 'one', minutes: 480 }] })
      .mockResolvedValueOnce({ ok: true, games: [{ appId: 2, name: 'two', minutes: 480 }] });
    vi.mocked(getDiscoveryGames).mockResolvedValue([{ appId: 9, name: 'new' }, { appId: 1, name: 'one' }, { appId: 8, name: 'newer' }, { appId: 2, name: 'two' }]);
    const result = await recommendGames(ids, 'fresh', 'unowned');
    expect(result).toMatchObject({ totalCommon: 0, totalCandidates: 2, games: [
      { appId: 9, owners: 0, score: null, missingIds: ids }, { appId: 8, owners: 0, score: null, missingIds: ids },
    ] });
    expect(getPlaySupport).not.toHaveBeenCalledWith(1);
  });
  it.each(['any', 'unowned'] as const)('%s에서도 비공개 목록을 미보유로 추정하지 않는다', async scope => {
    vi.mocked(getLibrary).mockResolvedValueOnce({ ok: true, games: [{ appId: 1, name: 'one', minutes: 60 }] }).mockResolvedValueOnce({ ok: false });
    expect(await recommendGames(ids, 'balanced', scope)).toMatchObject({ games: [], excluded: [ids[1]], checked: 0 });
    expect(getDiscoveryGames).not.toHaveBeenCalled();
  });
  it('새 후보 목록 조회 실패는 후보 없음과 구분한다', async () => {
    vi.mocked(getLibrary).mockResolvedValue({ ok: true, games: [{ appId: 1, name: 'one', minutes: 60 }] });
    vi.mocked(getDiscoveryGames).mockRejectedValue(new Error('unavailable'));
    await expect(recommendGames(ids, 'balanced', 'unowned')).rejects.toThrow('unavailable');
    expect(getPlaySupport).not.toHaveBeenCalled();
  });
});
