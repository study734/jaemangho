import { describe, expect, it, vi } from 'vitest';
import { authorizeMonitor, findings, sendNotification, validWebhook, type MonitorInput } from './monitor';

const input: MonitorInput = { envProblems: 0, chatEnabled: false, lastSuccess: null, latestJob: null, riot: [], steamErrors: 0 };
const hook = 'https://discord.com/api/webhooks/123456789012345678/test-token';

describe('운영 점검 정책', () => {
  it('외부 점검 기록 없음과 2시간 초과를 감지하고 경계에서는 알리지 않는다', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(findings({ ...input, externalCheck: null }, now).map((f) => f.key)).toEqual(['monitor.stale']);
    expect(findings({ ...input, externalCheck: '2026-10-10T09:59:59Z' }, now).map((f) => f.key)).toEqual(['monitor.stale']);
    expect(findings({ ...input, externalCheck: '2026-10-10T10:00:00Z' }, now)).toEqual([]);
  });
  it('채팅 미설정은 동기화 장애로 취급하지 않는다', () => expect(findings(input)).toEqual([]));
  it('전체 성공 시각과 부분 완료 상태를 별도로 감지한다', () => {
    const now = Date.parse('2026-10-07T00:00:00Z');
    expect(findings({ ...input, chatEnabled: true, lastSuccess: '2026-10-05T00:00:00Z', latestJob: { status: 'partial', startedAt: '2026-10-06T00:00:00Z' } }, now).map((f) => f.key)).toEqual(['chat.stale', 'chat.failed']);
    expect(findings({ ...input, chatEnabled: true, lastSuccess: '2026-10-06T23:00:00Z', latestJob: { status: 'running', startedAt: '2026-10-06T23:00:00Z' } }, now).map((f) => f.key)).toEqual(['chat.interrupted']);
  });
  it('키 오류와 반복 호출 제한·외부 오류를 구분한다', () => {
    expect(findings({ ...input, riot: [{ status: 403, count: 1 }, { status: 429, count: 5 }, { status: 503, count: 3 }], steamErrors: 3 }).map((f) => f.key))
      .toEqual(['riot.key', 'riot.limit', 'riot.upstream', 'steam.upstream']);
    expect(findings({ ...input, riot: [{ status: 429, count: 4 }], steamErrors: 2 })).toEqual([]);
  });
  it('감시 인증은 봇 설정 없이 CRON_SECRET만 사용한다', () => {
    expect(authorizeMonitor('Bearer secret', 'secret')).toBe('ok');
    expect(authorizeMonitor('Bearer wrong', 'secret')).toBe('unauthorized');
    expect(authorizeMonitor(null, '')).toBe('unconfigured');
  });
});

describe('운영 알림 전송', () => {
  it.each(['http://discord.com/api/webhooks/123456789012345678/x', 'https://evil.example/api/webhooks/123456789012345678/x', 'https://discord.com@127.0.0.1/a', hook + '?redirect=x'])('허용하지 않는 주소: %s', (url) => expect(validWebhook(url)).toBe(false));
  it('키·주소나 응답 내용을 실패 결과에 포함하지 않는다', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('secret token in upstream error'));
    expect(await sendNotification('알림', hook, fetchFn)).toBe('delivery_failed');
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).allowed_mentions).toEqual({ parse: [] });
    expect(await sendNotification('알림', 'http://localhost/', fetchFn)).toBe('invalid_configuration');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
