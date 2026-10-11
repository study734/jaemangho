import { describe, expect, it } from 'vitest';
import { canResumeChat, syncErrorCode } from './jobs';
import { chatRecoveryPlan } from '../../lib/chat-recovery';
import { safeFailure } from './jobs';
import { DiscordRateLimitedError, DiscordRequestError } from '../chat/bot';

describe('자동 채팅 이어받기 정책', () => {
  const now = Date.parse('2026-10-11T03:00:00Z');
  const job = { id: 'job', status: 'partial', finishedAt: new Date(now - 16 * 60_000).toISOString(), result: { rateLimited: true } };
  it('수집 미완료만 대기 시간 후 재시도하며 전체 성공·권한 실패·집계 실패는 반복하지 않는다', () => {
    expect(canResumeChat(job, now)).toBe(true);
    expect(canResumeChat({ ...job, result: { truncated: true } }, now)).toBe(true);
    for (const status of ['success', 'failed', 'running']) expect(canResumeChat({ ...job, status }, now)).toBe(false);
    expect(canResumeChat({ ...job, result: {} }, now)).toBe(false);
    expect(canResumeChat({ ...job, result: { rateLimited: true, warnings: ['highlights_failed'] } }, now)).toBe(false);
    expect(canResumeChat(undefined, now)).toBe(true);
  });
  it('15분 또는 Discord 대기 시간과 48시간 상한을 지킨다', () => {
    expect(canResumeChat({ ...job, finishedAt: new Date(now - 14 * 60_000).toISOString() }, now)).toBe(false);
    expect(canResumeChat({ ...job, result: { rateLimited: true, retryAfterMs: 3_600_000 } }, now)).toBe(false);
    expect(canResumeChat({ ...job, finishedAt: new Date(now - 48 * 3_600_000).toISOString() }, now)).toBe(false);
  });
  it('오류 원문의 비밀값 없이 허용한 진단 코드만 저장한다', () => {
    expect(syncErrorCode(new Error('secret-value'))).toBe('sync_failed');
    expect(syncErrorCode(new DiscordRequestError('discord_http_403'))).toBe('discord_http_403');
    expect(syncErrorCode(new DiscordRateLimitedError('time_budget'))).toBe('time_budget');
  });
});

describe('제한된 자동 복구', () => {
  const now = Date.parse('2026-10-11T03:00:00Z');
  const job = { id: 'root', status: 'failed', finishedAt: new Date(now - 16 * 60_000).toISOString(), errorCode: 'discord_timeout', result: null };
  it.each(['discord_timeout', 'discord_network', 'discord_http_500', 'discord_http_503', 'database_connection', 'database_retryable', 'interrupted'])('%s는 재시도한다', errorCode => {
    expect(chatRecoveryPlan({ ...job, errorCode }, now).state).toBe('ready');
  });
  it.each(['discord_http_401', 'discord_http_403', 'discord_http_404', 'discord_invalid_response', 'database_schema', 'database_error', 'sync_failed'])('%s는 사람에게 넘긴다', errorCode => {
    expect(chatRecoveryPlan({ ...job, errorCode }, now).state).toBe('manual_required');
  });
  it('연속 실패의 대기를 늘리고 6회 또는 첫 장애 48시간 후 중지한다', () => {
    expect(chatRecoveryPlan({ ...job, result: { recoveryAttempt: 1 } }, now).state).toBe('waiting');
    expect(chatRecoveryPlan({ ...job, result: { recoveryAttempt: 6 } }, now).state).toBe('exhausted');
    expect(chatRecoveryPlan({ ...job, result: { recoveryStartedAt: new Date(now - 48 * 3_600_000).toISOString() } }, now).state).toBe('exhausted');
  });
  it('누락된 실행과 30시간 지난 전체 성공은 보충하되 최근 성공은 반복하지 않는다', () => {
    expect(chatRecoveryPlan(undefined, now).state).toBe('ready');
    expect(chatRecoveryPlan({ ...job, status: 'success' }, now).state).toBe('not_needed');
    expect(chatRecoveryPlan({ ...job, status: 'success', finishedAt: new Date(now - 31 * 3_600_000).toISOString() }, now).state).toBe('ready');
  });
  it('집계 일시 오류만 자동 처리하고 원문·토큰 대신 SQLSTATE와 단계만 남긴다', () => {
    expect(chatRecoveryPlan({ ...job, status: 'partial', result: { warnings: ['awards_failed'], warningCodes: ['database_timeout'] } }, now).state).toBe('ready');
    expect(chatRecoveryPlan({ ...job, status: 'partial', result: { warnings: ['awards_failed'], warningCodes: ['database_schema'] } }, now).state).toBe('manual_required');
    const failure = safeFailure({ code: '42P01', message: 'secret-token', detail: 'private query' }, 'aggregate');
    expect(failure).toEqual({ stage: 'aggregate', code: 'database_schema', sqlState: '42P01' });
    expect(JSON.stringify(failure)).not.toContain('secret-token');
  });
});
