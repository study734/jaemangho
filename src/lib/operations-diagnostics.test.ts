import { describe, expect, it } from 'vitest';
import { chatDiagnosis, recoveryTitle, steamDiagnosis } from './operations-diagnostics';

describe('관리자 진단과 다음 조치', () => {
  it('새 채팅 기록은 시간 예산과 429를 구분하고 이전 기록은 원인을 추측하지 않는다', () => {
    const job = { status: 'partial' as const, errorCode: null, result: { channels: 1, messages: 5188, rateLimited: true } };
    expect(chatDiagnosis(job).reason).toContain('이전 기록은 구분 불가');
    expect(chatDiagnosis({ ...job, result: { ...job.result, stopReasons: ['time_budget'] } }).reason).toBe('수집 시간 예산 소진');
    expect(chatDiagnosis({ ...job, result: { ...job.result, stopReasons: ['discord_rate_limit'] } }).reason).toContain('(429)');
    expect(chatDiagnosis(job).action).toContain('다음 외부 점검');
  });
  it('권한 오류와 집계 실패는 자동 재시도 안내로 숨기지 않는다', () => {
    expect(chatDiagnosis({ status: 'failed', errorCode: 'discord_http_403', result: null }).action).toContain('권한');
    const derived = chatDiagnosis({ status: 'partial', errorCode: null, result: { channels: 1, messages: 10, rateLimited: false, warnings: ['daily_activity_failed'] } });
    expect(derived.reason).toBe('날짜별 활동 집계 실패');
    expect(derived.action).toContain('서버 로그');
  });
  it('Steam의 게임 정보 없음과 외부 장애 및 이전 미분류 기록을 구분한다', () => {
    expect(steamDiagnosis('http_429')).toContain('호출 제한');
    expect(steamDiagnosis('timeout')).toContain('시간 초과');
    expect(steamDiagnosis('app_unavailable')).toContain('서비스 장애 경고에 포함하지 않습니다');
    expect(steamDiagnosis('unavailable')).toContain('이전 기록');
  });
  it('복구 메시지는 이전 장애 문구를 반복하거나 완전한 복구를 단정하지 않는다', () => {
    expect(recoveryTitle('steam.upstream', 'Steam 요청 오류가 반복되었습니다.')).toBe('Steam 요청 오류가 이번 점검 구간에서 경고 기준(3건) 미만입니다.');
  });
});
