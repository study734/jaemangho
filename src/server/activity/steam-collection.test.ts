import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportFailure } from '../diagnostics';
import { runScheduledSteamCollection, SteamCollectionBudgetError, SteamCollectionBusyError, type runSteamCollection } from './steam-collection';

// 결과 분류만 본다: DB 연결과, 로그인(viewer → Better Auth)을 불러오는 동의 모듈은 가짜로 둔다.
vi.mock('../pool', () => ({ pool: {} }));
vi.mock('../steam/consent', () => ({ STEAM_FEATURE_NOTICE: 'test-notice' }));
vi.mock('../operations/usage', () => ({ usageStatus: vi.fn() }));
vi.mock('../diagnostics', () => ({ reportFailure: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

// intent/0001 R4·R5: 예약 수집 결과 분류(라우트는 이 결과를 그대로 응답한다).
describe('runScheduledSteamCollection', () => {
  it('25초 예산으로 예약 수집을 실행하고 개수만 돌려준다(작업 ID 없음)', async () => {
    const run = vi.fn<typeof runSteamCollection>(async () => ({ id: '00000000-0000-0000-0000-000000000001' as const, status: 'partial',
      eligible: 3, collected: 2, unavailable: 0, failed: 0, changes: 5, deferred: 1 }));
    expect(await runScheduledSteamCollection(run)).toEqual({ status: 'partial', eligible: 3, collected: 2, unavailable: 0, failed: 0, changes: 5, deferred: 1 });
    expect(run).toHaveBeenCalledWith('scheduled', { budgetMs: 25_000 });
  });
  it('무료 사용량 거부는 budget, 실행 중은 busy로 알리고 실패로 세지 않는다', async () => {
    expect(await runScheduledSteamCollection(vi.fn(async () => { throw new SteamCollectionBudgetError(); }))).toBe('budget');
    expect(await runScheduledSteamCollection(vi.fn(async () => { throw new SteamCollectionBusyError(); }))).toBe('busy');
    expect(reportFailure).not.toHaveBeenCalled();
  });
  it('그 밖의 오류는 failed로 알리고 steam.activity.scheduled로 기록한다(오류 원문은 돌려주지 않음)', async () => {
    const result = await runScheduledSteamCollection(vi.fn(async () => { throw new Error('steam-key-leak'); }));
    expect(result).toBe('failed');
    expect(reportFailure).toHaveBeenCalledWith('steam.activity.scheduled', expect.any(Error));
  });
});
