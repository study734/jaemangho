import { beforeEach, expect, it, vi } from 'vitest';
import { getLibrary, getAchievementDefinitions, getAchievementProgress } from './client';
import { registeredIds } from './roster';
import { findMissions, missionsQuerySchema } from './missions';
vi.mock('./client', () => ({ getLibrary: vi.fn(), getAchievementDefinitions: vi.fn(), getAchievementProgress: vi.fn() }));
vi.mock('./roster', async original => ({ ...await original<typeof import('./roster')>(), registeredIds: vi.fn() }));
const ids = ['76561190000000001', '76561190000000002'];
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(registeredIds).mockImplementation(async ids => ids);
  vi.mocked(getLibrary).mockResolvedValue({ ok: true, games: [{ appId: 1, name: 'one', minutes: 60 }] });
  vi.mocked(getAchievementDefinitions).mockResolvedValue([{ id: 'a', title: 'A', description: null, hidden: false }]);
  vi.mocked(getAchievementProgress).mockResolvedValue({ ok: true, achievements: [{ id: 'a', unlocked: false }] });
});
it('등록·공개·보유 조건을 진행도 조회 전에 확인한다', async () => {
  vi.mocked(registeredIds).mockResolvedValue([ids[0]]);
  expect(await findMissions(ids, 1)).toEqual({ unknownIds: [ids[1]] });
  expect(getLibrary).not.toHaveBeenCalled();
  vi.mocked(registeredIds).mockResolvedValue(ids);
  vi.mocked(getLibrary).mockResolvedValueOnce({ ok: false });
  expect(await findMissions(ids, 1)).toMatchObject({ state: 'unavailable', unavailableIds: [ids[0]] });
  vi.mocked(getLibrary).mockResolvedValueOnce({ ok: true, games: [] });
  expect(await findMissions(ids, 1)).toMatchObject({ state: 'not-owned', missingIds: [ids[0]] });
  expect(getAchievementProgress).not.toHaveBeenCalled();
});
it('공개 과제 없음·진행도 실패·전원 달성을 구분한다', async () => {
  vi.mocked(getAchievementDefinitions).mockResolvedValueOnce([]);
  expect(await findMissions(ids, 1)).toMatchObject({ state: 'unsupported' });
  vi.mocked(getAchievementProgress).mockRejectedValueOnce(new Error('private'));
  expect(await findMissions(ids, 1)).toMatchObject({ state: 'unavailable', missions: [] });
  vi.mocked(getAchievementProgress).mockResolvedValue({ ok: true, achievements: [{ id: 'a', unlocked: true }] });
  expect(await findMissions(ids, 1)).toMatchObject({ state: 'complete', completedTogether: 1 });
});
it('선택한 한 게임만 최대 4개 병렬로 조회한다', async () => {
  let active = 0; let peak = 0;
  vi.mocked(getAchievementProgress).mockImplementation(async () => {
    active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { ok: true, achievements: [{ id: 'a', unlocked: false }] };
  });
  const all = Array.from({ length: 10 }, (_, i) => String(76561190000000000n + BigInt(i)));
  expect(await findMissions(all, 1)).toMatchObject({ state: 'ok', missions: [{ lockedIds: all }] });
  expect(peak).toBe(4); expect(getAchievementProgress).toHaveBeenCalledTimes(10);
  for (const args of vi.mocked(getAchievementProgress).mock.calls) expect(args[1]).toBe(1);
});
it('과제 쿼리는 2~20명과 양수 appId만 허용한다', () => {
  expect(missionsQuerySchema.safeParse({ ids: ids.join(','), appId: 1 }).success).toBe(true);
  for (const appId of [0, -1, 1.5, 4294967296, 'oops']) expect(missionsQuerySchema.safeParse({ ids: ids.join(','), appId }).success).toBe(false);
});
