import { expect, it } from 'vitest';
import { operatorNotice } from './escalation';
import type { JobEntry } from '../../lib/operations';
const now = Date.parse('2026-10-11T03:00:00Z');
const at = new Date(now).toISOString();
const job: JobEntry = { id: 'test', status: 'partial', source: 'scheduled', startedAt: at, finishedAt: at, result: { rateLimited: true }, errorCode: null };
it('재시도 가능한 동기화는 기록만 하고 상한·영구 오류는 즉시 알린다', () => {
  expect(operatorNotice('chat.failed', at, job, now).notify).toBe(false);
  expect(operatorNotice('chat.failed', at, { ...job, result: { rateLimited: true, recoveryAttempt: 6 } }, now).notify).toBe(true);
  expect(operatorNotice('chat.failed', at, { ...job, status: 'failed', errorCode: 'discord_http_403' }, now).notify).toBe(true);
  expect(operatorNotice('chat.failed', new Date(now - 6 * 3600000).toISOString(), job, now).notify).toBe(true);
});
it('외부 일시 오류는 30분간 조용히 재점검하고 감시 공백은 즉시 알린다', () => {
  expect(operatorNotice('steam.upstream', at, job, now).notify).toBe(false);
  expect(operatorNotice('steam.upstream', new Date(now - 1800000).toISOString(), job, now).notify).toBe(true);
  expect(operatorNotice('monitor.stale', at, job, now).notify).toBe(true);
});
