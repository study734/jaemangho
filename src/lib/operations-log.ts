import type { OperationsData } from './operations';

export type LogLevel = 'error' | 'warning' | 'info';
export interface OperationsLogEntry {
  id: string;
  level: LogLevel;
  state: string;
  title: string;
  at: string | null;
  detail?: string;
}

// 저장된 장애 심각도와 복구 상태를 화면의 로그 수준으로 변환한다.
export function operationsLog(data: OperationsData, now: number): OperationsLogEntry[] {
  const entries: OperationsLogEntry[] = [];
  if (!data.checkedAt || now - Date.parse(data.checkedAt) > 3_600_000) {
    entries.push({
      id: 'monitor.stale', level: 'warning', state: '확인 필요', at: data.checkedAt,
      title: data.checkedAt ? '마지막 운영 점검 후 1시간 이상 지났습니다.' : '운영 점검 기록이 없습니다.',
      detail: '감시 워크플로 실행 기록을 확인하세요. 마지막 점검 시각에는 수동 점검도 포함됩니다.',
    });
  }
  for (const alert of data.alerts) {
    entries.push({
      id: alert.key,
      level: alert.active ? (alert.severity === 'critical' ? 'error' : 'warning') : 'info',
      state: alert.active ? '발생 중' : '복구', title: alert.title,
      at: alert.active ? alert.firstSeen : alert.resolvedAt,
      detail: alert.active ? '마지막 점검에서 감지된 문제입니다.' : '이전 경고가 해소되었습니다. 현재 발생 중인 문제가 아닙니다.',
    });
    if (alert.notificationError) entries.push({
      id: `${alert.key}.notification`, level: 'warning', state: '전송 확인 필요', at: null,
      title: 'Discord 운영 알림을 전송하지 못했습니다.',
      detail: `관련 항목: ${alert.title} 수신 설정을 확인하세요.`,
    });
  }
  if (!entries.some((entry) => entry.level !== 'info')) entries.push({
    id: 'monitor.healthy', level: 'info', state: '점검 결과', at: data.checkedAt,
    title: '마지막 점검에서 감지된 문제가 없습니다.',
  });
  const rank = { error: 0, warning: 1, info: 2 };
  return entries.sort((a, b) => rank[a.level] - rank[b.level] ||
    (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0));
}
