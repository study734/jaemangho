'use client';

import { useCallback, useEffect, useState } from 'react';
import { AUDIT_LABELS, type OperationsData, type ViewReport } from '@/lib/operations';
import { TRACKED } from '@/lib/track';
import { operationsLog, type LogLevel } from '@/lib/operations-log';
import { adminStyles as styles, Panel, ScrollTable } from './AdminUi';

const when = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';
const labels: Record<string, string> = { running: '실행 중', success: '완료', partial: '부분 완료', failed: '실패', started: '진행 또는 결과 확인 필요' };
const warnings: Record<string, string> = { highlights_failed: '개념글 갱신 실패', awards_failed: '시상식 갱신 실패' };
const levels = { error: 'Error · 오류', warning: 'Warning · 경고', info: 'Info · 정보' };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body = await response.json().catch(() => null); // 504 등 JSON이 아닌 응답
  if (!response.ok) throw new Error(body?.error ?? `요청 실패 (${response.status})`);
  if (body === null) throw new Error('응답을 해석하지 못했습니다.');
  return body;
}

// 운영 데이터는 한 곳에서 불러와 탭이 바뀌어도 폴링이 하나만 돌게 한다.
export function useOperations() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ level: LogLevel; message: string } | null>(null);
  const [now, setNow] = useState(0);
  const load = useCallback(async () => {
    try {
      const next = await json<OperationsData>('/api/admin/operations');
      setData(next);
      setNow(Date.now());
      setError(null);
    } catch { setError('운영 현황을 불러오지 못했습니다. 표시된 정보는 최신이 아닐 수 있습니다.'); }
  }, []);
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    // 비동기 조회 결과로만 상태를 갱신한다.
    void Promise.resolve().then(load);
    return () => clearInterval(timer);
  }, [load]);

  const command = async (action: string) => {
    if (action === 'purge-steam' && !confirm('Steam 캐시를 비우시겠습니까? 다음 조회부터 Steam을 다시 호출합니다.')) return;
    if (action === 'sync' && !confirm('채팅 동기화를 다시 실행하시겠습니까? Discord에서 최근 메시지의 집계 정보를 가져옵니다.')) return;
    setBusy(true); setNotice(null);
    try {
      const result = await json<{ status?: string; skipped?: boolean }>('/api/admin/operations?action=' + action, { method: 'POST' });
      setNotice({
        level: result.skipped || result.status === 'partial' ? 'warning' : 'info',
        message: result.skipped ? '다른 점검이 진행 중이라 이번 요청은 실행하지 않았습니다. 잠시 후 현황을 확인하세요.'
          : result.status === 'partial' ? '일부만 완료되었습니다. 연동 탭의 실행 기록에서 사유를 확인하세요.' : '작업을 완료했습니다.',
      });
    } catch (e) { setNotice({ level: 'error', message: (e as Error).message }); }
    finally { setBusy(false); await load(); }
  };
  return { data, error, busy, notice, now, command, refresh: load };
}
export type Operations = ReturnType<typeof useOperations>;

// 작업 결과와 조회 실패는 탭과 관계없이 같은 자리에 보인다.
export function OpsNotice({ ops }: { ops: Operations }) {
  return <>
    {ops.error && <p role="alert" className="ops-log-notice"><strong className="ops-log-level ops-log-error">Error · 오류</strong> {ops.error}</p>}
    {ops.notice && <p role={ops.notice.level === 'error' ? 'alert' : 'status'} className="ops-log-notice">
      <strong className={`ops-log-level ops-log-${ops.notice.level}`}>{levels[ops.notice.level]}</strong> {ops.notice.message}
    </p>}
  </>;
}

export function OpsStatusPanel({ ops, onOpenIntegrations }: { ops: Operations; onOpenIntegrations?: () => void }) {
  const { data, error, busy, now, command } = ops;
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const entries = data ? operationsLog(data, now) : [];
  const visible = entries.filter((entry) => filter === 'all' || entry.level === filter);
  return <Panel title="운영 상태와 알림" actions={<button className="btn btn-secondary" disabled={busy} onClick={() => command('check')}>지금 점검</button>}>
    {!data && !error && <p>운영 현황을 불러오는 중입니다.</p>}
    {data && <>
      <p style={styles.muted}>마지막 점검: {when(data.checkedAt)} · Discord 알림 주소: {data.notificationsConfigured ? '설정됨' : '미설정'}</p>
      <p style={styles.muted}>현황 조회: {when(new Date(now).toISOString())} · 30초마다 자동 갱신 · 한국 시간</p>
      <p style={styles.muted}>Error: 긴급 오류 · Warning: 확인이 필요한 경고 · Info: 점검 결과와 복구 기록</p>
      <div style={styles.controls} role="group" aria-label="운영 로그 수준 필터">
        {(['all', 'error', 'warning', 'info'] as const).map((level) => <button key={level}
          className={`btn ${filter === level ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={filter === level} onClick={() => setFilter(level)}>
          {level === 'all' ? '전체' : levels[level]} {level === 'all' ? entries.length : entries.filter((entry) => entry.level === level).length}
        </button>)}
      </div>
      {onOpenIntegrations && <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onOpenIntegrations}>연동 상태와 실행 기록 보기</button>}
      <ul className="ops-log-list" aria-label="운영 로그">
        {visible.map((entry) => <li key={entry.id} className={`ops-log-row ops-log-${entry.level}`}>
          <strong className="ops-log-level">{levels[entry.level]}</strong>
          <div className="ops-log-content">
            <p className="ops-log-title"><strong>{entry.state}</strong> · {entry.title}</p>
            {entry.detail && <p className="ops-log-detail">{entry.detail}</p>}
            <p className="ops-log-detail">{entry.id} · {when(entry.at)}</p>
          </div>
        </li>)}
      </ul>
      {visible.length === 0 && <p role="status">선택한 수준의 로그가 없습니다.</p>}
    </>}
  </Panel>;
}

export function ChatSyncPanel({ ops }: { ops: Operations }) {
  const { data, busy, now, command } = ops;
  const running = data?.jobs.some((j) => j.status === 'running' && now - new Date(j.startedAt).getTime() < 5 * 60_000);
  return <Panel title="채팅 동기화" actions={<button className="btn btn-primary" disabled={busy || !data?.chatConfigured || running} onClick={() => command('sync')}>동기화 재실행</button>}>
    <p style={styles.muted}>마지막 전체 성공: {when(data?.lastSuccess ?? null)} · 실행 기록 90일 보관</p>
    {data && !data.chatConfigured && <p>Discord 봇이 설정되지 않았습니다. 설정 후 재실행할 수 있습니다.</p>}
    <ScrollTable head={['시작 (한국 시간)', '실행', '상태', '처리 결과']}>
      {data?.jobs.map((j) => <tr key={j.id}>
        <td style={styles.cell}>{when(j.startedAt)}</td><td style={styles.cell}>{j.source === 'manual' ? '관리자' : '자동'}</td>
        <td style={styles.cell}>{j.status === 'running' && now - new Date(j.startedAt).getTime() > 5 * 60_000 ? '중단 추정 · 재실행 가능' : labels[j.status]}</td>
        <td style={styles.cell}>{j.result ? <>{j.result.channels}개 채널 · {j.result.messages}개 메시지
          {j.result.channels === 0 && ' · 대상 채널 없음'}{j.result.rateLimited && ' · 호출 제한/시간 초과'}{j.result.truncated && ' · 페이지 상한 도달'}
          {j.result.warnings?.map((w) => <span key={w}> · {warnings[w] ?? w}</span>)}</> : j.errorCode === 'interrupted' ? '중단된 실행' : j.errorCode ? '실패 · 서버 로그 확인' : '처리 중'}</td>
      </tr>)}
      {data?.jobs.length === 0 && <tr><td style={styles.cell} colSpan={4}>실행 기록이 없습니다.</td></tr>}
    </ScrollTable>
  </Panel>;
}

export function SteamPanel({ ops }: { ops: Operations }) {
  const { data, busy, command } = ops;
  return <Panel title="Steam 호출과 캐시" actions={<button className="btn btn-secondary" disabled={busy || !data} onClick={() => command('purge-steam')}>Steam 캐시 비우기</button>}>
    <p style={styles.muted}>유효 캐시 {data?.steam.cache.fresh ?? '—'}건 / 전체 {data?.steam.cache.rows ?? '—'}건 · 게임 목록 5분, 계정 조회 15분 재사용</p>
    <ScrollTable head={['날짜', '캐시 응답', '외부 호출', '오류']}>
      {data?.steam.stats.map((s) => <tr key={s.day}><td style={styles.cell}>{s.day}</td><td style={styles.cell}>{s.hits}</td><td style={styles.cell}>{s.misses}</td><td style={styles.cell}>{s.errors}</td></tr>)}
      {data?.steam.stats.length === 0 && <tr><td style={styles.cell} colSpan={4}>아직 호출 기록이 없습니다.</td></tr>}
    </ScrollTable>
    {data && data.steam.errors.length > 0 && <details><summary>최근 Steam 오류</summary><ul style={styles.list}>{data.steam.errors.map((e, i) => <li key={i}>{when(e.at)} · {e.endpoint} · {e.code}</li>)}</ul></details>}
  </Panel>;
}

export function AuditPanel({ ops }: { ops: Operations }) {
  const { data } = ops;
  return <Panel title="관리자 작업 이력" actions={<a className="btn btn-secondary" href="/api/admin/operations?resource=export" download>운영 현황 내보내기</a>}>
    <p style={styles.muted}>최근 100건 표시 · 180일 보관 · 진행 상태가 오래 남으면 실제 작업 결과를 확인하세요.</p>
    <ScrollTable head={['시각', '작업자', '작업', '대상', '결과']}>
      {data?.audit.map((a) => <tr key={a.id}><td style={styles.cell}>{when(a.createdAt)}</td><td style={styles.cell}>{a.actorName}</td>
        <td style={styles.cell}>{AUDIT_LABELS[a.action] ?? a.action}</td><td style={styles.cell}>{a.target}</td><td style={styles.cell}>{labels[a.result]}</td></tr>)}
      {data?.audit.length === 0 && <tr><td style={styles.cell} colSpan={5}>작업 이력이 없습니다.</td></tr>}
    </ScrollTable>
  </Panel>;
}

export function BackupNote() {
  return <Panel title="백업과 복구">
    <p>운영 현황 내보내기는 장애 조사용이며 데이터 복구용 백업이 아닙니다.</p>
    <p style={styles.muted}>전체 DB 백업·격리 DB 복구 검증 도구와 대응 절차는 저장소의 OPERATIONS.md에 있습니다. 운영 DB 복구는 별도 승인 후 진행하세요.</p>
    <ol style={styles.list}><li>DB 서비스의 백업 보존 기간과 복구 가능 시점을 확인합니다.</li><li>전체 백업을 별도 보관하고 무결성 체크섬을 확인합니다.</li><li>격리된 빈 DB에 복구한 뒤 로그인·목록·집계·마이그레이션을 검증합니다.</li></ol>
  </Panel>;
}

export function ViewAnalytics() {
  const [days, setDays] = useState('7');
  const [end, setEnd] = useState('');
  const [report, setReport] = useState<ViewReport | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10));
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ resource: 'views', days, ...(end ? { end } : {}) });
    void json<ViewReport>('/api/admin/operations?' + query, { signal: controller.signal }).then((r) => {
      setReport(r); setError(false); setLoading(false);
    }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => controller.abort();
  }, [days, end]);
  const selectPeriod = (value: string) => { setLoading(true); setDays(value); };
  const selectEnd = (value: string) => { setLoading(true); setEnd(value); };
  const total = report?.summary.reduce((n, r) => n + r.current, 0) ?? 0;
  const previous = report?.summary.reduce((n, r) => n + r.previous, 0) ?? 0;
  return <Panel title={`화면별 열람 (최근 ${days}일)`} actions={
    <div style={styles.controls}>
      <label>기간 <select aria-label="열람 통계 기간" value={days} onChange={(e) => selectPeriod(e.target.value)} style={styles.input}>
        <option value="7">7일</option><option value="30">30일</option><option value="90">90일</option></select></label>
      <label>종료일 <input aria-label="열람 통계 종료일" type="date" value={end} max={today} onChange={(e) => selectEnd(e.target.value)} style={styles.input} /></label>
    </div>}>
    <p style={styles.muted}>한국 시간 기준 · 관리자 열람 제외 · 개인 식별 정보 미수집 · 변경 전 관리자 집계와 기록 없는 기간은 비교 시 주의하세요.</p>
    {loading && <p role="status">통계를 불러오는 중입니다.</p>}
    {error && <p role="alert">통계를 불러오지 못했습니다. 날짜를 확인하거나 새로고침하세요.</p>}
    {report && !loading && !error && <>
      <p>{report.start} ~ {report.end}: {total}회 · 이전 기간 {previous}회 ({report.previousStart} ~ {report.previousEnd})</p>
      <ScrollTable head={['화면', '선택 기간', '이전 기간', '변화']}>
        {report.summary.map((r) => <tr key={r.path}><td style={styles.cell}>{TRACKED[r.path as keyof typeof TRACKED] ?? r.path}</td>
          <td style={styles.cell}>{r.current}</td><td style={styles.cell}>{r.previous}</td><td style={styles.cell}>{r.current - r.previous > 0 ? '+' : ''}{r.current - r.previous}회</td></tr>)}
        {!report.summary.length && <tr><td style={styles.cell} colSpan={4}>선택 기간에 기록이 없습니다.</td></tr>}
      </ScrollTable>
      <details><summary>날짜별 열람 추이</summary>
        <ScrollTable head={['날짜', '전체 열람']}>{report.daily.map((d) => <tr key={d.day}><td style={styles.cell}>{d.day}</td><td style={styles.cell}>{d.views}</td></tr>)}</ScrollTable>
      </details>
    </>}
  </Panel>;
}
