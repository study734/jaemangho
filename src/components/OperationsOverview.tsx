'use client';

import { useEffect, useState } from 'react';
import { AUTOMATION_WORKFLOWS, actionsLink, automationDiagnosis, type AutomationEvidence, type AutomationKind } from '@/lib/automation-status';
import { chatRecoveryPlan } from '@/lib/chat-recovery';
import { chatDiagnosis, recoveryDiagnosis } from '@/lib/operations-diagnostics';
import { operationsLog } from '@/lib/operations-log';
import { adminStyles as styles, Panel } from './AdminUi';
import type { Operations } from './OperationsPanel';

const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';

export function OperationsOverview({ ops, automation }: { ops: Operations; automation: AutomationEvidence | null }) {
  const { data, error, now } = ops;
  const issues = data ? operationsLog(data, now).filter(entry => entry.level !== 'info') : [];
  if (automation) for (const kind of Object.keys(AUTOMATION_WORKFLOWS) as AutomationKind[]) {
    const diagnosis = automationDiagnosis(kind, automation, now);
    if (['attention', 'unknown'].includes(diagnosis.state)) issues.push({
      id: `automation.${kind}`, level: 'warning', state: '확인 필요',
      title: `${AUTOMATION_WORKFLOWS[kind].label} · ${diagnosis.label}`, detail: diagnosis.action,
      at: automation.workflows[kind].latest?.at ?? automation.checkedAt,
    });
  }
  if (automation?.artifacts.available && automation.artifacts.bytes !== null && automation.artifacts.bytes >= 400_000_000) issues.push({
    id: 'storage.budget', level: 'warning', state: '확인 필요', title: '저장소 보관량이 400MB 예산에 도달했습니다.',
    detail: '백업 업로드 실패 여부와 계정 전체 보관 용량을 확인하세요. 기존 복구 자료는 자동 삭제하지 않습니다.', at: automation.checkedAt,
  });
  const latest = data?.jobs[0];
  const plan = chatRecoveryPlan(latest, now);
  const automatic = latest && ['waiting', 'ready', 'running'].includes(plan.state);
  const needsHelp = !automatic || issues.some(issue => !['chat.failed', 'chat.interrupted', 'chat.stale'].includes(issue.id))
    || issues.some(issue => issue.at && now - Date.parse(issue.at) >= 6 * 3_600_000);
  const headline = error || !data ? '현재 상태 확인 필요'
    : !issues.length ? automation ? '최근 앱 점검·자동 보호에서 발견된 문제 없음' : '앱 점검에서 문제 없음 · 자동 보호는 별도 확인'
      : needsHelp ? `확인이 필요한 항목 ${issues.length}건` : '채팅 자동 복구 대기·진행 중';
  return <Panel title="지금 필요한 조치">
    <p className="ops-overview-headline">{headline}</p>
    <p style={styles.muted}>앱 점검과 확인된 자동 보호 기록을 모았습니다. 세부 실행 기록과 공급자 사용량은 아래에서 확인합니다.</p>
    {error && <p>조회가 실패해 이전 기록을 표시하고 있습니다. 새로고침 후 판단하세요.</p>}
    <ul className="ops-action-list" aria-label="필요한 운영 조치">
      {issues.map(issue => <li key={issue.id}>
        <strong>{issue.title}</strong>
        <p>{issue.detail}</p>
        <span className="ops-overview-time">감지: {when(issue.at)}</span>
        {issue.id.startsWith('automation.') && <p><a href={actionsLink(automation?.workflows[issue.id.slice('automation.'.length) as AutomationKind]?.latest?.id)} target="_blank" rel="noreferrer">해당 자동화 실행 확인</a></p>}
      </li>)}
    </ul>
    {data && !issues.length && !error && <p>현재 앱 점검 기준으로 직접 처리할 항목은 없습니다.</p>}
    {data?.chatConfigured && <div className="ops-recovery-summary">
      <strong>채팅 복구 · {latest ? chatDiagnosis(latest).reason : '실행 기록 없음'}</strong>
      <p>{latest ? recoveryDiagnosis(latest, now) : '다음 복구 실행에서 누락된 동기화를 확인합니다.'}</p>
      <p style={styles.muted}>다음 시도는 최소 대기 후 예약 실행에서 시작합니다. 표시 시각에 즉시 실행된다는 뜻은 아닙니다.</p>
      <p style={styles.muted}>복구 실행기 마지막 완료: {when(data.recoveryCheckedAt)} · 전체 동기화 성공: {when(data.lastSuccess)}</p>
    </div>}
  </Panel>;
}

export function AutomationPanel({ now, revision, onEvidence }: { now: number; revision: number; onEvidence: (evidence: AutomationEvidence | null) => void }) {
  const [evidence, setEvidence] = useState<AutomationEvidence | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/admin/operations?resource=automation', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('inspection_failed');
        const body = await response.json() as AutomationEvidence;
        if (!body.workflows?.backup || !body.workflows.restore || !body.workflows.smoke || !body.artifacts) throw new Error('invalid_evidence');
        setEvidence(body); onEvidence(body); setFailed(false); setLoading(false);
      } catch { if (!controller.signal.aborted) { setFailed(true); onEvidence(null); setLoading(false); } }
    };
    void Promise.resolve().then(load);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60 * 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [revision, onEvidence]);
  const artifacts = evidence?.artifacts;
  const artifactMB = artifacts?.bytes === null || artifacts?.bytes === undefined ? null : artifacts.bytes / 1_000_000;
  return <Panel title="자동 운영 보호와 무료 용량" actions={<a className="btn btn-secondary" href={actionsLink()} target="_blank" rel="noreferrer">자동화 실행 기록</a>}>
    <p style={styles.muted}>공개 main 실행 메타데이터 · 정상 조회는 최대 1시간 재사용 · 한국 시간 · 성공 기록과 활성화 설정은 구분합니다.</p>
    {loading && <p role="status">자동 운영 보호를 확인하는 중입니다.</p>}
    {failed && <p role="alert">자동화 정보를 확인하지 못했습니다. 작업 실패로 단정하지 말고 실행 기록을 확인하세요.</p>}
    <ul className="ops-automation-list" aria-label="자동 운영 보호">
      {(Object.keys(AUTOMATION_WORKFLOWS) as AutomationKind[]).map(kind => {
        const config = AUTOMATION_WORKFLOWS[kind];
        const result = evidence && !failed ? automationDiagnosis(kind, evidence, now) : null;
        const item = evidence?.workflows[kind];
        return <li key={kind}>
          <div className="ops-automation-heading"><strong>{config.label}</strong><span>{result?.label ?? (loading ? '조회 중' : '확인 불가')}</span></div>
          <p>{result?.action ?? '실행 기록을 확인하기 전에는 보호가 정상이라고 판단할 수 없습니다.'}</p>
          <p className="ops-overview-time">예약: {config.schedule} · 마지막 성공: {when(item?.lastSuccess?.at)}</p>
          <a href={item?.latest ? actionsLink(item.latest.id) : `https://github.com/study734/jaemangho/actions/workflows/${config.file}`} target="_blank" rel="noreferrer">{config.label} 실행 확인</a>
        </li>;
      })}
    </ul>
    <h4>무료 용량 보호</h4>
    <p>저장소 보관 파일: {artifactMB === null ? '확인 불가' : `${artifactMB.toFixed(1)} MB${artifacts?.complete ? '' : ' 이상 · 일부 목록만 확인'}`}</p>
    {artifactMB !== null && artifactMB >= 400 && <p role="alert">저장소 보관량이 400MB 예산에 도달했습니다. 백업 업로드 실패 여부와 보관 용량을 확인하세요.</p>}
    <p style={styles.muted}>백업은 파일 10MB·예상 보관량 400MB를 넘으면 업로드를 중단합니다. 기존 백업은 자동 삭제하지 않습니다. 이 숫자는 해당 저장소의 파일 크기 합계이며 다른 저장소·Packages·과금 기간 누적 사용량을 포함하지 않습니다.</p>
    <p>Neon 연산·프로젝트 전체 저장량, Vercel CPU·전송량, Cloudflare 실제 사용량: <strong>이 화면에서 확인 불가</strong></p>
    <p style={styles.muted}>전체 사용량에 따른 자동 감속은 아직 적용되지 않았습니다. 현재는 DB를 깨우지 않는 5분 감시, 30분 DB 점검, 복구 6회·48시간 상한과 백업 용량 제한으로 사용량을 줄입니다.</p>
    <div style={styles.controls}>
      <a className="btn btn-secondary" href="https://console.neon.tech" target="_blank" rel="noreferrer">Neon 사용량</a>
      <a className="btn btn-secondary" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Vercel 사용량</a>
      <a className="btn btn-secondary" href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">Cloudflare 사용량</a>
      <a className="btn btn-secondary" href="https://github.com/settings/billing" target="_blank" rel="noreferrer">GitHub 계정 사용량</a>
    </div>
    {evidence && <p style={styles.muted}>메타데이터 조회: {when(evidence.checkedAt)}</p>}
    <details><summary>자동화와 사람의 결정 범위</summary><p>일시 오류 재시도·동기화 이어받기·조건부 배포 롤백·백업·격리 복원 검증은 자동화합니다. 운영 DB 복원, 권한·비밀키 변경, 유료 플랜 전환은 직접 결정합니다. 독립 Worker의 실제 실행 상태와 활성화 플래그는 해당 서비스 설정에서 확인하세요.</p></details>
  </Panel>;
}
