import { describe, expect, it } from 'vitest';
import type { OperationsData } from './operations';
import { operationsLog } from './operations-log';

const now = Date.parse('2026-10-07T01:00:00Z');
const data: OperationsData = {
  checkedAt: '2026-10-07T00:30:00Z', notificationsConfigured: true, chatConfigured: true,
  alerts: [], jobs: [], audit: [], lastSuccess: null,
  steam: { cache: { rows: 0, fresh: 0 }, stats: [], errors: [] },
};
const alert: OperationsData['alerts'][number] = {
  key: 'chat.stale', title: '채팅 동기화 성공 기록이 없거나 30시간 이상 지났습니다.',
  severity: 'warning', active: true, firstSeen: '2026-10-07T00:00:00Z', resolvedAt: null, notificationError: null,
};

describe('운영 로그 표시', () => {
  it('발생 중 오류와 경고를 복구 정보보다 먼저 표시한다', () => {
    const entries = operationsLog({ ...data, alerts: [
      { ...alert, key: 'recovered', active: false, severity: 'critical', resolvedAt: data.checkedAt },
      alert, { ...alert, key: 'riot.key', severity: 'critical' },
    ] }, now);
    expect(entries.map(({ id, level, state }) => ({ id, level, state }))).toEqual([
      { id: 'riot.key', level: 'error', state: '발생 중' },
      { id: 'chat.stale', level: 'warning', state: '발생 중' },
      { id: 'recovered', level: 'info', state: '복구' },
    ]);
    expect(entries[2].at).toBe(data.checkedAt);
  });
  it('점검 지연을 경고하고 정상이라는 메시지를 함께 표시하지 않는다', () => {
    expect(operationsLog({ ...data, checkedAt: null }, now)).toMatchObject([{ id: 'monitor.stale', level: 'warning', at: null }]);
    expect(operationsLog({ ...data, checkedAt: '2026-10-06T23:59:59Z' }, now)).toHaveLength(1);
    expect(operationsLog({ ...data, checkedAt: '2026-10-07T00:00:00Z' }, now)[0].id).toBe('monitor.healthy');
  });
  it('복구만 남은 최신 점검은 정상 결과와 복구 설명을 정보로 표시한다', () => {
    const entries = operationsLog({ ...data, alerts: [{ ...alert, active: false, resolvedAt: data.checkedAt }] }, now);
    expect(entries.every((entry) => entry.level === 'info')).toBe(true);
    expect(entries.find((entry) => entry.id === alert.key)?.detail).toContain('이전 경고가 해소');
    expect(entries.some((entry) => entry.id === 'monitor.healthy')).toBe(true);
  });
  it('복구된 장애의 알림 전송 실패도 별도 경고로 유지한다', () => {
    const entries = operationsLog({ ...data, alerts: [{ ...alert, active: false, resolvedAt: data.checkedAt, notificationError: 'delivery_failed' }] }, now);
    expect(entries[0]).toMatchObject({ id: 'chat.stale.notification', level: 'warning', at: null });
    expect(entries.some((entry) => entry.id === 'monitor.healthy')).toBe(false);
  });
});
