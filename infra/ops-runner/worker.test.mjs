import { expect, it } from 'vitest';
import worker, { needsAttention } from './worker.mjs';

// scheduled는 Durable Object(실제 점검)의 응답만 보고 Workers 실행을 실패로 남길지 정한다.
const env = (body, status = 200) => ({ RUNNER: { idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body, { status }) }) } });

it('알림 기준(10분) 전의 일시 장애는 실행 실패로 남기지 않는다', async () => {
  await expect(worker.scheduled({}, env({ status: 'unavailable', notificationFailed: false, attention: false }))).resolves.toBeUndefined();
  await expect(worker.scheduled({}, env({ status: 'healthy', notificationFailed: false, attention: false }))).resolves.toBeUndefined();
});

it('알림이 나간 장애가 이어지거나 알림 전송이 실패하면 실행 실패로 남긴다', async () => {
  await expect(worker.scheduled({}, env({ status: 'unavailable', notificationFailed: false, attention: true }))).rejects.toThrow('requires attention: unavailable');
  await expect(worker.scheduled({}, env({ status: 'healthy', notificationFailed: true, attention: true }))).rejects.toThrow('notificationFailed=true');
});

it('다른 실행이 진행 중(409)이면 넘어가고 그 외 실패 응답은 실행 실패로 남긴다', async () => {
  await expect(worker.scheduled({}, env({}, 409))).resolves.toBeUndefined();
  await expect(worker.scheduled({}, env({}, 500))).rejects.toThrow('Independent runner failed');
});

it('needsAttention: 알림 전 일시 장애·정상은 아니고, 알림 중 장애·알림 실패·설정 오류 알림은 맞다', () => {
  expect(needsAttention({ status: 'unavailable', notified: 'healthy', notificationFailed: false })).toBe(false);
  expect(needsAttention({ status: 'healthy', notified: 'healthy', notificationFailed: false })).toBe(false);
  expect(needsAttention({ status: 'unavailable', notified: 'unavailable', notificationFailed: false })).toBe(true);
  expect(needsAttention({ status: 'configuration', notified: 'configuration', notificationFailed: false })).toBe(true);
  expect(needsAttention({ status: 'unavailable', notified: 'healthy', notificationFailed: true })).toBe(true);
});
