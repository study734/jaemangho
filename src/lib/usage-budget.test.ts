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
    expect(usageMode({ ...sample(1), at: '2026-10-10T09:00:00Z' }, 'paused', now)).toBe('paused');
    expect(usageMode({ ...sample(1), at: '2026-10-10T09:00:00Z' }, 'normal', now)).toBe('limited');
  });
  it('GitHub 예약 지연으로 벌어진 간격(14.5시간)은 정상 샘플을 감속하지 않고 24시간을 넘기면 감속한다', () => {
    const aged = (hours: number) => ({ ...sample(10), at: new Date(now - hours * 3_600_000).toISOString() });
    expect(usageMode(aged(14.5), 'normal', now)).toBe('normal');
    expect(usageMode(aged(24), 'normal', now)).toBe('normal');
    expect(usageMode(aged(24.1), 'normal', now)).toBe('limited');
  });
  it('감속 상태는 성공 여부와 관계없이 예약 시도 간격을 제한한다', () => {
    const budget: UsageBudget = { checkedAt: null, sample: sample(80), mode: 'limited', errorCode: null, stale: false };
    // 하루 한 번 도는 실행은 다음 날 거부하고, 이틀째는 시작 시각이 조금 당겨져도(점검이 빨리 끝남) 허용한다.
    expect(scheduledCollectionAllowed(budget, new Date(now - 24 * 3_600_000).toISOString(), now)).toBe(false);
    expect(scheduledCollectionAllowed(budget, new Date(now - 35 * 3_600_000).toISOString(), now)).toBe(false);
    expect(scheduledCollectionAllowed(budget, new Date(now - (48 * 3_600_000 - 5_000)).toISOString(), now)).toBe(true);
    expect(scheduledCollectionAllowed(budget, new Date(now - 48 * 3_600_000).toISOString(), now)).toBe(true);
    expect(scheduledCollectionAllowed({ ...budget, mode: 'paused' }, null, now)).toBe(false);
  });
});
