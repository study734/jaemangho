import { chatRecoveryPlan } from '../../lib/chat-recovery';
import { chatDiagnosis, recoveryDiagnosis } from '../../lib/operations-diagnostics';
import type { JobEntry } from '../../lib/operations';

// 경고는 화면에 즉시 남기고, 사람에게는 개입할 이유가 생겼을 때만 보낸다.
export function operatorNotice(key: string, firstSeen: string, latest: JobEntry | undefined, now = Date.now()) {
  if (key === 'chat.failed' || key === 'chat.interrupted') {
    if (!latest) return { notify: true, detail: '원인: 실행 기록 부족. 조치: 봇 설정과 서버 로그를 확인하세요.' };
    const plan = chatRecoveryPlan(latest, now);
    const needsHelp = ['manual_required', 'exhausted'].includes(plan.state) || now - Date.parse(firstSeen) >= 6 * 3_600_000;
    return { notify: needsHelp, detail: `영향: 채팅 기반 기록·집계 갱신 지연. 원인: ${chatDiagnosis(latest).reason}. 자동 처리: ${recoveryDiagnosis(latest, now)} 실행 ID: ${latest.id}. 조치: 연동 탭에서 실패 단계를 확인한 뒤 원인을 해결하세요.` };
  }
  if (['steam.upstream', 'riot.upstream', 'riot.limit'].includes(key)) {
    return { notify: now - Date.parse(firstSeen) >= 30 * 60_000,
      detail: '영향: 외부 서비스 조회 실패가 30분 이상 반복됩니다. 자동 처리: 정상 캐시를 유지하며 재점검했습니다. 조치: 외부 서비스 장애·호출량을 확인하세요. 캐시를 비우지 마세요.' };
  }
  return { notify: true, detail: key === 'chat.recovery' ? '자동 복구 상한에 도달했습니다. 최신 실행 ID·실패 단계로 원인을 해결한 뒤 수동 재실행하세요.'
    : key === 'recovery.stale' || key === 'monitor.stale' ? '자동 실행 공백입니다. 독립 Worker 및 GitHub Actions의 실행·비밀값 설정을 확인하세요.'
      : '자동 처리할 수 없는 상태입니다. 관리자 운영 상태에서 원인과 다음 조치를 확인하세요.' };
}
