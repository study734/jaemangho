import { describe, expect, it } from 'vitest';
import { usageMode, scheduledCollectionAllowed, type UsageBudget, type UsageSample } from './usage-budget';
const now = Date.parse('2026-10-11T10:00:00Z');
const sample = (percent: number): UsageSample => ({ at: new Date(now).toISOString(), periodStart: '2026-10-03T00:00:00Z', computeSeconds: percent * 3600, transferBytes: 0 });
describe('무료 예산 보호', () => {
  it('실제 연산·전송 중 큰 사용 비율로 감속·중단하고 정상화에 여유를 둔다', () => {
    expect(usageMode(sample(79), 'normal', now)).toBe('normal');
    expect(usageMode(sample(80), 'normal', now)).toBe('limited');
    expect(usageMode(sample(90), 'normal', now)).toBe('paused');
    expect(usageMode(sample(75), 'paused', now)).toBe('paused');
    expect(usageMode(sample(74), 'paused', now)).toBe('normal');
    expect(usageMode(sample(70), 'limited', now)).toBe('limited');
    expect(usageMode(sample(69), 'limited', now)).toBe('normal');
    expect(usageMode({ ...sample(0), transferBytes: 4_500_000_000 }, 'normal', now)).toBe('paused');
  });
  it('조회 실패·오래된 샘플로 중단을 풀지 않으며 정상도 감속한다', () => {
    expect(usageMode(null, 'paused', now)).toBe('paused');
    expect(usageMode(null, 'normal', now)).toBe('limited');
    expect(usageMode({ ...sample(1), at: '2026-10-10T20:00:00Z' }, 'paused', now)).toBe('paused');
  });
  it('감속 상태는 성공 여부와 관계없이 예약 시도 간격을 제한한다', () => {
    const budget: UsageBudget = { checkedAt: null, sample: sample(80), mode: 'limited', errorCode: null, stale: false };
    expect(scheduledCollectionAllowed(budget, new Date(now - 47 * 3_600_000).toISOString(), now)).toBe(false);
    expect(scheduledCollectionAllowed(budget, new Date(now - 48 * 3_600_000).toISOString(), now)).toBe(true);
    expect(scheduledCollectionAllowed({ ...budget, mode: 'paused' }, null, now)).toBe(false);
  });
});
