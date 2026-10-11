export const AUTOMATION_WORKFLOWS = {
  backup: { file: 'production-backup.yml', label: '암호화 백업', maxAgeHours: 36, schedule: '매일 03:19' },
  restore: { file: 'production-restore-check.yml', label: '보관 백업 복원 검증', maxAgeHours: 192, schedule: '목요일 03:47' },
  smoke: { file: 'smoke.yml', label: '배포 검사', maxAgeHours: 2, schedule: '배포 후·30분 간격' },
} as const;
export type AutomationKind = keyof typeof AUTOMATION_WORKFLOWS;
export interface AutomationRun {
  id: number; at: string; status: string; conclusion: string | null;
}
export interface AutomationEvidence {
  checkedAt: string;
  workflows: Record<AutomationKind, { available: boolean; latest: AutomationRun | null; lastSuccess: AutomationRun | null; artifactPresent?: boolean | null }>;
  artifacts: { available: boolean; bytes: number | null; complete: boolean };
}
export const actionsLink = (id?: number) => id
  ? `https://github.com/study734/jaemangho/actions/runs/${id}`
  : 'https://github.com/study734/jaemangho/actions';

export function automationDiagnosis(kind: AutomationKind, evidence: AutomationEvidence, now: number) {
  const item = evidence.workflows[kind];
  const sampled = Date.parse(evidence.checkedAt);
  if (!item.available || !Number.isFinite(sampled) || now - sampled > 75 * 60_000 || sampled > now + 60_000)
    return { state: 'unknown', label: '확인 불가', action: 'GitHub 실행 기록을 직접 확인하세요. 조회 실패를 작업 실패로 단정하지 않습니다.' };
  if (item.latest?.status !== 'completed' && item.latest)
    return { state: 'running', label: '실행 중·대기 중', action: '현재 실행의 완료 여부를 확인하세요. 이전 성공 기록은 아래에 유지합니다.' };
  if (item.latest && item.latest.conclusion !== 'success')
    return { state: 'attention', label: item.latest.conclusion === 'skipped' ? '실행 생략' : '최근 실행 확인 필요', action: '실패·취소·생략 원인과 활성화 설정을 실행 기록에서 확인하세요.' };
  const success = item.lastSuccess && Date.parse(item.lastSuccess.at);
  if (!success || !Number.isFinite(success) || success > now + 60_000 || now - success >= AUTOMATION_WORKFLOWS[kind].maxAgeHours * 3_600_000)
    return { state: 'attention', label: '성공 기록 공백', action: '최근 main 실행에서 성공 기록을 확인하지 못했습니다. 예약과 설정을 확인하세요.' };
  if (kind !== 'smoke' && item.artifactPresent !== true) return item.artifactPresent === false
    ? { state: 'attention', label: '보관 파일 없음', action: '실행은 성공했지만 보관 파일을 찾지 못했습니다. 만료·삭제 여부와 새 백업을 확인하세요.' }
    : { state: 'unknown', label: '보관 파일 확인 불가', action: '성공 기록은 있으나 보관 파일 목록을 확인하지 못했습니다. 실행 기록의 파일을 확인하세요.' };
  return { state: 'healthy', label: '최근 실행 정상', action: kind === 'smoke'
    ? '검사 성공 기록입니다. 자동 롤백 활성화 설정 자체를 증명하지는 않습니다.'
    : '최근 main 실행 성공을 확인했습니다. 예약 지연은 별도로 발생할 수 있습니다.' };
}
