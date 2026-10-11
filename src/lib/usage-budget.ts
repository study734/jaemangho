export const USAGE_MAX_AGE = 12 * 3_600_000;
export const NEON_BUDGET = { computeSeconds: 100 * 3600, transferBytes: 5_000_000_000 };
export interface UsageSample { at: string; periodStart: string; computeSeconds: number; transferBytes: number }
export interface UsageBudget {
  checkedAt: string | null; sample: UsageSample | null; errorCode: string | null;
  mode: 'normal' | 'limited' | 'paused' | 'unconfigured'; stale: boolean;
}
// 80%에서 감속, 90%에서 예약 수집 중단. 복구에는 여유를 둬 경계에서 반복 전환하지 않는다.
export function usageMode(sample: UsageSample | null, previous: UsageBudget['mode'], now = Date.now()): UsageBudget['mode'] {
  if (!sample || !Number.isFinite(Date.parse(sample.at)) || now - Date.parse(sample.at) > USAGE_MAX_AGE)
    return previous === 'paused' ? 'paused' : 'limited';
  const ratio = Math.max(sample.computeSeconds / NEON_BUDGET.computeSeconds, sample.transferBytes / NEON_BUDGET.transferBytes);
  if (ratio >= .9 || previous === 'paused' && ratio >= .75) return 'paused';
  if (ratio >= .8 || previous === 'limited' && ratio >= .7) return 'limited';
  return 'normal';
}
export function scheduledCollectionAllowed(budget: UsageBudget, lastAttempt: string | null, now = Date.now()) {
  if (budget.mode === 'paused') return false;
  return budget.mode !== 'limited' || !lastAttempt || now - Date.parse(lastAttempt) >= 48 * 3_600_000;
}
