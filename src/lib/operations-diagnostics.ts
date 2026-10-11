import { chatRecoveryPlan, MAX_RECOVERY_ATTEMPTS, transientChatError } from './chat-recovery';
import type { JobEntry } from './operations';

const reasons: Record<string, string> = {
  discord_rate_limit: 'Discord 호출 제한(429)', time_budget: '수집 시간 예산 소진', page_limit: '한 채널의 60페이지 상한 도달',
  discord_http_401: 'Discord 봇 인증 실패(401)', discord_http_403: 'Discord 채널 접근 권한 부족(403)',
  discord_http_404: 'Discord 서버 또는 채널을 찾을 수 없음(404)', discord_timeout: 'Discord 응답 시간 초과',
  discord_network: 'Discord 네트워크 연결 실패', discord_invalid_response: 'Discord 응답 형식 오류',
  interrupted: '실행 제한 또는 강제 종료로 완료 기록이 남지 않음', sync_failed: '동기화 또는 DB 처리 실패(세부 원인 미기록)',
  database_schema: 'DB 테이블 또는 컬럼 누락', database_timeout: 'DB 처리 시간 초과', database_connection: 'DB 연결 실패', database_retryable: 'DB 일시 오류(교착·연결 재시작 등)', database_error: 'DB 처리 오류',
};
const warnings: Record<string, string> = {
  highlights_failed: '개념글 집계 실패', awards_failed: '시상식 집계 실패', daily_activity_failed: '날짜별 활동 집계 실패',
};
export function chatDiagnosis(job: Pick<JobEntry, 'status' | 'result' | 'errorCode'>) {
  const { result, errorCode } = job;
  if (job.status === 'failed') {
    const reason = errorCode && (reasons[errorCode] ?? (/^discord_http_5\d\d$/.test(errorCode) ? `Discord 서버 오류(${errorCode.slice(-3)})` : null));
    return { reason: reason ?? reasons.sync_failed, action: /discord_http_40[134]/.test(errorCode ?? '')
      ? '봇 토큰과 채널 보기·메시지 기록 읽기 권한을 확인한 뒤 재실행하세요.'
      : errorCode === 'database_schema' ? '배포 마이그레이션 성공 여부를 확인하세요. 적용된 SQL 파일은 수정하지 마세요.'
        : transientChatError(errorCode) ? '일시 오류로 분류했습니다. 아래 자동 복구 상태에서 대기 시간·시도 횟수를 확인하세요. 저장된 페이지는 이어 받습니다.'
          : '자동 복구를 멈췄습니다. 실행 ID와 실패 단계로 코드를 확인한 뒤 재실행하세요.' };
  }
  if (job.status === 'running') return { reason: '동기화 실행 중', action: '완료를 기다리세요. 5분 이상 지속되면 중단된 실행인지 확인하세요.' };
  const parts = (result?.stopReasons ?? []).map(code => reasons[code] ?? '수집 중단(미분류)');
  if (!parts.length && result?.rateLimited) parts.push('호출 제한 또는 시간 예산 소진(이전 기록은 구분 불가)');
  if (result?.truncated && !result.stopReasons?.includes('page_limit')) parts.push(reasons.page_limit);
  if (result?.channels === 0) parts.push('이름에 ⛵가 있는 대상 텍스트·공지 채널 없음');
  parts.push(...(result?.warnings ?? []).map((code, index) => `${warnings[code] ?? '파생 집계 실패'}${result?.warningCodes?.[index] ? ` (${reasons[result.warningCodes[index]] ?? result.warningCodes[index]})` : ''}`));
  if (job.status === 'success') return { reason: '전체 채널 수집과 집계 완료', action: '추가 조치가 필요하지 않습니다.' };
  return { reason: parts.join(' · ') || '부분 완료(세부 원인 미기록)', action: (result?.rateLimited || result?.truncated) && !result.warnings?.length
    ? '저장 위치부터 이어 받습니다. 최소 15분 대기 후 별도 복구 작업에서 자동 재시도합니다. 급하면 동기화 재실행을 누르세요. 예약 실행이 지연되면 재시도도 지연됩니다.'
    : result?.channels === 0 ? '대상 채널 이름의 ⛵ 표시와 봇의 채널 접근 권한을 확인하세요.'
      : '수집한 메시지는 저장됐지만 수집 또는 집계가 미완료입니다. 해당 시각의 서버 로그를 확인하고 재실행하세요.' };
}

export function steamDiagnosis(code: string) {
  if (code === 'app_unavailable') return '해당 게임의 스토어 정보가 제공되지 않습니다. 추천에서 제외하며 서비스 장애 경고에 포함하지 않습니다.';
  if (code === 'timeout') return 'Steam 응답 시간 초과. 잠시 후 재시도하세요. 캐시는 비우지 마세요.';
  if (code === 'network') return 'Steam 네트워크 연결 실패. 외부 연결 상태를 확인하세요.';
  if (code === 'invalid_response') return 'Steam 응답 형식이 예상과 다릅니다. 해당 게임과 서버 처리 코드를 확인하세요.';
  const status = /^(?:http_)?(\d{3})$/.exec(code)?.[1];
  if (status === '429') return 'Steam 호출 제한(429). 호출을 줄이고 잠시 후 재시도하세요.';
  if (status === '401' || status === '403') return `Steam 접근 거부(${status}). Web API는 키를, 공개 스토어는 요청 제한을 확인하세요.`;
  if (status?.startsWith('5')) return `Steam 서버 오류(${status}). 외부 서비스 복구를 기다리세요.`;
  if (status) return `Steam HTTP 오류(${status}). 해당 요청 경로를 확인하세요.`;
  return '이전 기록은 실패 사유를 구분하지 않았습니다. 새 실행부터 HTTP 오류·타임아웃·응답 오류를 구분합니다.';
}

export function recoveryTitle(key: string, original: string) {
  const titles: Record<string, string> = {
    'steam.upstream': 'Steam 요청 오류가 이번 점검 구간에서 경고 기준(3건) 미만입니다.',
    'monitor.stale': '외부 운영 점검의 성공 기록이 갱신되었습니다.',
    'chat.stale': '채팅 전체 동기화 성공 기록이 30시간 이내입니다.',
    'chat.failed': '최근 채팅 동기화가 실패·부분 완료 상태에서 벗어났습니다.',
    'recovery.stale': '자동 복구 실행 기록이 갱신되었습니다.',
    'chat.recovery': '채팅 자동 복구 중지 상태가 해제되었습니다. 최신 실행 결과를 확인하세요.',
    'usage.unknown': 'Neon 사용량 조회가 정상화되었습니다.',
    'usage.budget': '무료 예산 보호에 의한 예약 수집 제한이 해제되었습니다.',
    'chat.interrupted': '오래된 채팅 실행이 정리되었거나 실행 상태가 갱신되었습니다.',
    'riot.key': '이번 점검 구간에서 Riot 인증 오류가 감지되지 않았습니다.',
    'riot.limit': '이번 점검 구간에서 Riot 호출 제한이 경고 기준 미만입니다.',
    'riot.upstream': '이번 점검 구간에서 Riot 서버 오류가 경고 기준 미만입니다.',
    configuration: '환경변수 설정 경고가 해제되었습니다.',
  };
  return titles[key] ?? `이전 경고 해제: ${original}`;
}

export function recoveryDiagnosis(job: JobEntry, now: number) {
  const plan = chatRecoveryPlan(job, now);
  const count = `자동 복구 ${plan.attempt}/${MAX_RECOVERY_ATTEMPTS}회`;
  if (plan.state === 'exhausted') return `${count} · 자동 복구 중지: 6회 또는 48시간 상한. 원인을 해결한 뒤 수동 재실행하세요.`;
  if (plan.state === 'manual_required') return `${count} · 수동 조치 필요: 인증·권한·설정 또는 미분류 오류는 자동 반복하지 않습니다.`;
  if (job.status === 'success' && plan.state === 'ready') return '전체 성공이 30시간 이상 갱신되지 않았습니다. 다음 복구 작업이 누락된 동기화를 시작합니다.';
  if (plan.state === 'waiting' || plan.state === 'ready') return `${count} · 다음 시도 가능: ${new Date(plan.nextAt!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}. 별도 복구 예약 실행에서 이어 받습니다.`;
  if (plan.state === 'running') return `${count} · 실행 중. 5분 넘게 완료되지 않으면 다음 복구 작업이 중단 기록을 정리합니다.`;
  return `${count} · 추가 복구 불필요`;
}
