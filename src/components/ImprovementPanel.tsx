'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson, clientErrorMessage } from '@/lib/http-client';
import { KIND_LABEL, type ImprovementKind, type ImprovementReport } from '@/lib/improvements';
import { adminStyles, Panel } from './AdminUi';

// 관리자 "개선" 탭: 무엇을 고치거나 키울지 순서대로 보여준다. 판단 규칙은 src/lib/improvements.ts.
const KIND_COLOR: Record<ImprovementKind, string> = {
  fix: 'var(--status-error)', check: 'var(--status-warning)', grow: 'var(--primary)', review: 'var(--steel)',
};

export function ImprovementPanel() {
  const [report, setReport] = useState<ImprovementReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  // 새로고침을 연달아 누르면 마지막 요청의 결과만 반영한다.
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const data = await requestJson<ImprovementReport>('/api/admin?resource=improvements');
      if (id !== latest.current) return;
      setReport(data);
      setError(null);
    } catch (e) {
      if (id === latest.current) setError(clientErrorMessage(e));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return (
    <Panel title="개선 우선순위 (최근 7일)" actions={<button className="btn btn-secondary" disabled={loading} onClick={load}>다시 계산</button>}>
      <p style={adminStyles.muted}>
        운영 경고, 서버 실패 횟수, Riot·Steam 오류, 채팅 동기화 결과와 화면별 열람 변화(그 전 7일과 비교)를 묶어 순서를 정합니다.
        고치기 → 살펴보기(사용 감소) → 키우기(사용 증가) → 정리 검토(거의 안 쓰임) 순입니다.
      </p>
      {loading && !report && <p role="status" style={adminStyles.muted}>우선순위를 계산하는 중입니다.</p>}
      {error && <div role="alert" style={styles.error}>Error · 개선 우선순위 조회 실패: {error}{report && ' · 이전 결과를 표시하고 있습니다.'}</div>}
      {report && !report.usageEnough && (
        <p style={adminStyles.muted}>최근 2주 열람이 {report.totalViews.current + report.totalViews.previous}회라 사용량 변화는 판단하지 않았습니다(30회 이상부터).</p>
      )}
      {report && report.items.length === 0 && <p style={adminStyles.muted}>지금 고치거나 살펴볼 항목이 없습니다.</p>}
      {report && report.items.length > 0 && (
        <ol style={styles.list} aria-label="개선 우선순위">
          {report.items.map((item) => (
            <li key={item.id} style={styles.row}>
              <div style={styles.head}>
                <span style={{ ...styles.kind, color: KIND_COLOR[item.kind], borderColor: KIND_COLOR[item.kind] }}>{KIND_LABEL[item.kind]}</span>
                <strong style={styles.target}>{item.target}</strong>
                <span style={styles.views}>최근 7일 열람 {item.views}회</span>
              </div>
              <ul style={styles.reasons}>{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              {item.next && <p style={styles.next}>다음 조치: {item.next}</p>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const styles: Record<string, React.CSSProperties> = {
  error: { padding: '12px 16px', borderRadius: 8, backgroundColor: 'rgba(255, 74, 74, 0.12)', color: 'var(--status-error)', fontSize: 13.5, margin: '12px 0' },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: { padding: '16px 0', borderTop: '1px solid var(--hairline)', minWidth: 0 },
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  kind: { border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  target: { color: 'var(--ink)', fontSize: 16, overflowWrap: 'anywhere' },
  views: { color: 'var(--slate)', fontSize: 12, marginLeft: 'auto' },
  reasons: { margin: '8px 0 0', paddingLeft: 20, color: 'var(--ink)', fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere' },
  next: { margin: '8px 0 0', color: 'var(--slate)', fontSize: 13, lineHeight: 1.6 },
};
