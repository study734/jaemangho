// 사용량 샘플이 이보다 오래되면 '확인 불가'로 보고 예약 수집을 감속한다.
// 수집은 GitHub 예약(6시간)인데 실제 실행 간격이 최대 14.5시간까지 벌어져(2026-11-10·11-12)
// 12시간 기준에서는 사용량이 정상이어도 감속·복구 알림이 반복됐다. 예산은 월 단위라 하루 늦은 감지는 감수한다.
export const USAGE_MAX_AGE = 24 * 3_600_000;
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
// 감속(limited)이면 이틀에 한 번만 예약 수집한다. 예약 실행은 하루 한 번이고 시작 시각이 날마다 조금씩 흔들리므로
// 정확히 48시간을 요구하면 이틀째가 몇 초 모자라 사흘에 한 번이 된다. 36시간 이상이면 다음 날은 막고 이틀째는 허용한다.
const LIMITED_INTERVAL = 36 * 3_600_000;
export function scheduledCollectionAllowed(budget: UsageBudget, lastAttempt: string | null, now = Date.now()) {
  if (budget.mode === 'paused') return false;
  return budget.mode !== 'limited' || !lastAttempt || now - Date.parse(lastAttempt) >= LIMITED_INTERVAL;
}
