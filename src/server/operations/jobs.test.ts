import { describe, expect, it } from 'vitest';
import { canResumeChat, syncErrorCode } from './jobs';
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
    expect(canResumeChat(undefined, now)).toBe(false);
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
