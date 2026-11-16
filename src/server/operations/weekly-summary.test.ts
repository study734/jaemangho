import { describe, expect, it } from 'vitest';
import { lastCompletedWeek, projectUsage, summarizeWeek, type WeekInput } from './weekly-summary';
import type { UsageBudget } from '../../lib/usage-budget';

const usage = (hours: number, gb: number, at = '2026-11-16T00:00:00Z', extra: Partial<UsageBudget> = {}): UsageBudget => ({
  checkedAt: at, errorCode: null, mode: 'normal', stale: false,
  sample: { at, periodStart: '2026-11-01T00:00:00Z', computeSeconds: hours * 3600, transferBytes: gb * 1e9 }, ...extra,
});
const quiet = (over: Partial<WeekInput> = {}): WeekInput => ({
  week: { start: '2026-11-09', end: '2026-11-16' }, usage: usage(10, 0.5),
  alerts: { opened: [], resolved: [], active: [] }, failures: [], chat: { failed: 0, partial: 0 }, interventions: { total: 0, failed: 0 }, ...over,
});

describe('lastCompletedWeek', () => {
  it('한국 시간 기준 지난 월~일을 고른다(일요일 밤·월요일 새벽 경계 포함)', () => {
    expect(lastCompletedWeek(Date.parse('2026-11-16T03:00:00Z'))).toEqual({ start: '2026-11-09', end: '2026-11-16' }); // 월 12시 KST
    expect(lastCompletedWeek(Date.parse('2026-11-15T14:59:00Z'))).toEqual({ start: '2026-11-02', end: '2026-11-09' }); // 일 23:59 KST
    expect(lastCompletedWeek(Date.parse('2026-11-15T15:00:00Z'))).toEqual({ start: '2026-11-09', end: '2026-11-16' }); // 월 00:00 KST
    expect(lastCompletedWeek(Date.parse('2026-11-20T03:00:00Z'))).toEqual({ start: '2026-11-09', end: '2026-11-16' }); // 금요일에도 같은 주
  });
});

describe('projectUsage', () => {
  it('집계 기간 경과 비율로 월말 사용량을 추정하고, 하루 미만이면 추정하지 않는다', () => {
    const p = projectUsage(usage(30, 1, '2026-11-16T00:00:00Z'))!; // 15일 경과, 30일 기간
    expect(p.compute).toBeCloseTo(0.3);
    expect(p.projectedCompute).toBeCloseTo(0.6);
    expect(p.projectedTransfer).toBeCloseTo(0.4);
    expect(projectUsage(usage(1, 0, '2026-11-01T12:00:00Z'))!.projectedCompute).toBeNull();
    expect(projectUsage({ ...usage(0, 0), sample: null })).toBeNull();
  });
});

describe('summarizeWeek', () => {
  it('볼 것이 없는 주는 보내지 않는다', () => {
    expect(summarizeWeek(quiet())).toBeNull();
  });

  it('월말 추정이 70%를 넘으면 감속 전에 무료 사용량을 알린다', () => {
    const text = summarizeWeek(quiet({ usage: usage(40, 1) }))!; // 현재 40%, 월말 약 80%
    expect(text).toContain('[재망호 주간 요약] 11/9–11/15');
    expect(text).toContain('Neon 연산 40%·전송 20% (이 속도면 월말 연산 80%·전송 40%) · 예약 수집 정상');
  });

  it('사용량을 확인할 수 없으면 원인과 조치를 적는다', () => {
    expect(summarizeWeek(quiet({ usage: { checkedAt: null, sample: null, errorCode: 'unconfigured', mode: 'unconfigured', stale: true } })))
      .toContain('Neon 사용량 확인 불가: NEON_API_KEY 미등록 · 예약 수집 미설정');
    expect(summarizeWeek(quiet({ usage: usage(10, 0, undefined, { stale: true, mode: 'limited' }) })))
      .toContain('최근 24시간 샘플 없음 · 예약 수집 감속');
  });

  it('DB 다시 시도 회복은 무료 인프라로, 나머지 실패·경고·개입은 따로 묶는다', () => {
    const text = summarizeWeek(quiet({
      failures: [{ operation: 'db.connect-retry', code: 'recovered', count: 4 }, { operation: 'api/steam.GET', code: 'timeout', count: 2 }, { operation: 'chat.award-post', code: 'unexpected', count: 5 }],
      alerts: { opened: [{ key: 'chat.failed', title: '채팅 실패', severity: 'critical' }], resolved: [{ key: 'chat.failed', title: '채팅 실패', severity: 'critical' }], active: [] },
      chat: { failed: 1, partial: 2 }, interventions: { total: 3, failed: 1 },
    }))!;
    expect(text).toContain('DB 새 연결 시간 초과 후 다시 시도로 회복 4회');
    expect(text).toContain('새 경고 1건: 긴급 채팅 실패');
    expect(text).toContain('해소 1건');
    expect(text).toContain('서버 실패 7회: chat.award-post(unexpected) 5, api/steam.GET(timeout) 2');
    expect(text).toContain('채팅 동기화 실패 1회·부분 완료 2회');
    expect(text).toContain('관리자 수동 작업 3회(실패 1)');
    expect(text).not.toContain('db.connect-retry(');
  });
});
