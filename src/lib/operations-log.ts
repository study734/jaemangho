import type { OperationsData } from './operations';
import { chatDiagnosis, recoveryDiagnosis, recoveryTitle, steamDiagnosis } from './operations-diagnostics';

export type LogLevel = 'error' | 'warning' | 'info';
export interface OperationsLogEntry {
  id: string;
  level: LogLevel;
  state: string;
  title: string;
  at: string | null;
  detail?: string;
}

function alertDetail(key: string, data: OperationsData, now: number) {
  if (key.startsWith('usage.')) return '영향: 예약 채팅 수집·복구가 감속 또는 중단될 수 있습니다. Free usage protection 실행·Neon 실제 사용량을 확인하세요. 조회 실패·12시간 지난 샘플은 정상으로 판단하지 않으며 백업·장애 감시는 유지합니다.';
  if (key.startsWith('chat.')) {
    const latest = data.jobs[0];
    return `영향: 채팅 기반 기록과 집계가 최신이 아닐 수 있습니다. ${latest ? `${chatDiagnosis(latest).reason}. ${chatDiagnosis(latest).action} ${recoveryDiagnosis(latest, now)}` : '연동 탭에서 실행 기록과 봇 설정을 확인하세요.'}`;
  }
  if (key === 'recovery.stale') return '자동 복구 작업의 실행 공백입니다. 사이트 장애와 구분하며 Actions의 recovery 작업을 확인하세요. 예약이 지연되면 워크플로 수동 실행 또는 동기화 재실행으로 복구합니다.';
  if (key === 'monitor.stale') return '외부 점검 성공이 없거나 2시간을 넘겼습니다. 사이트 장애를 뜻하지 않습니다. GitHub Actions의 Operations monitor 시작 시각·결과를 확인하세요. 수동 점검은 외부 성공 시각을 갱신하지 않습니다.';
  if (key === 'steam.upstream') {
    const recent = data.steam.errors.find(error => error.code !== 'app_unavailable');
    return `영향: 일부 게임의 추천·지원 정보 조회가 실패할 수 있습니다. ${recent ? `${recent.endpoint} · ${steamDiagnosis(recent.code)}` : '연동 탭의 최근 Steam 오류에서 원인을 확인하세요.'}`;
  }
  return '마지막 점검에서 감지된 문제입니다. 연동 상태와 해당 실행 시각의 서버 로그를 확인하세요.';
}

// 저장된 장애 심각도와 복구 상태를 화면의 로그 수준으로 변환한다.
export function operationsLog(data: OperationsData, now: number): OperationsLogEntry[] {
  const entries: OperationsLogEntry[] = [];
  if (data.usage && (data.usage.mode !== 'normal' || data.usage.stale || data.usage.errorCode)
    && !data.alerts.some(alert => alert.key.startsWith('usage.') && alert.active)) entries.push({
    id: 'usage.status', level: 'warning', state: '확인 필요', at: data.usage.checkedAt,
    title: data.usage.mode === 'paused' ? '무료 예산 보호로 예약 채팅 수집이 중단됐습니다.'
      : data.usage.mode === 'limited' ? '무료 예산 보호로 예약 채팅 수집을 감속했습니다.' : 'Neon 사용량 보호가 아직 검증되지 않았습니다.',
    detail: alertDetail('usage.status', data, now),
  });
  if (!data.checkedAt || now - Date.parse(data.checkedAt) > 3_600_000) {
    entries.push({
      id: 'monitor.internal-stale', level: 'warning', state: '확인 필요', at: data.checkedAt,
      title: data.checkedAt ? '마지막 운영 점검 후 1시간 이상 지났습니다.' : '운영 점검 기록이 없습니다.',
      detail: '감시 워크플로 실행 기록을 확인하세요. 마지막 점검 시각에는 수동 점검도 포함됩니다.',
    });
  }
  if (data.externalCheckedAt !== undefined && (!data.externalCheckedAt || now - Date.parse(data.externalCheckedAt) > 2 * 3_600_000)
    && !data.alerts.some(alert => alert.key === 'monitor.stale' && alert.active)) {
    entries.push({ id: 'monitor.external-stale', level: 'warning', state: '확인 필요', at: data.externalCheckedAt,
      title: '외부 운영 점검의 성공 기록이 없거나 2시간 이상 지났습니다.', detail: alertDetail('monitor.stale', data, now) });
  }
  for (const alert of data.alerts) {
    entries.push({
      id: alert.key,
      level: alert.active ? (alert.severity === 'critical' ? 'error' : 'warning') : 'info',
      state: alert.active ? '발생 중' : '복구', title: alert.active ? alert.title : recoveryTitle(alert.key, alert.title),
      at: alert.active ? alert.firstSeen : alert.resolvedAt,
      detail: alert.active ? alertDetail(alert.key, data, now) : '이전 경고가 해소되었습니다. 현재 발생 중인 문제가 아닙니다. 오류 경고 해제는 이번 검사 구간의 기준 충족 여부이며 외부 서비스의 완전한 복구를 보장하지 않습니다.',
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
