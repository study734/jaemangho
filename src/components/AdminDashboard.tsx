'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { adminStyles, Panel, ScrollTable } from './AdminUi';
import { operationsLog } from '@/lib/operations-log';
import { AuditPanel, BackupNote, ChatSyncPanel, OpsNotice, OpsStatusPanel, SteamPanel, ViewAnalytics, useOperations } from './OperationsPanel';

interface Status {
  cache: { rows: number; fresh: number; bytes: number };
  database: { bytes: number };
  counts: { members: number; users: number; blocked: number; admins: number };
  errorsByStatus: { status: number; count: number }[];
  recentErrors: { at: string; status: number; path: string }[];
  stats: { day: string; hits: number; misses: number }[];
  pageViews: { path: string; today: number; week: number }[];
  envProblems: string[];
}
interface AdminUser {
  id: string;
  name: string;
  username: string | null;
  isAdmin: boolean;
  blocked: boolean;
  loginCount: number;
  lastLogin: string;
}
interface AdminMember {
  id: string;
  gameName: string;
  tagLine: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
}

interface Props {
  // 등록 소환사 삭제(서버 반영 + 화면 상태 갱신). 실패하면 예외를 던진다.
  onDeleteMember: (id: string) => Promise<void>;
}

// Neon 무료 플랜 저장 용량: 프로젝트당 1GB (neon.com/docs/introduction/plans, neon.com/faqs/free-plan-limits-and-quotas 에서 확인).
const DB_LIMIT_BYTES = 1024 * 1024 * 1024;

type TabId = 'overview' | 'people' | 'integrations' | 'records';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'people', label: '사용자' },
  { id: 'integrations', label: '연동' },
  { id: 'records', label: '기록' },
];

const hitRate = (d: { hits: number; misses: number }) =>
  d.hits + d.misses === 0 ? '-' : `${Math.round((d.hits / (d.hits + d.misses)) * 100)}%`;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `요청 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

export const AdminDashboard: React.FC<Props> = ({ onDeleteMember }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, m] = await Promise.all([
        call<Status>('/api/admin?resource=status'),
        call<AdminUser[]>('/api/admin?resource=users'),
        call<AdminMember[]>('/api/admin?resource=members'),
      ]);
      setStatus(s);
      setUsers(u);
      setMembers(m);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const purgeCache = async () => {
    if (!confirm('Riot 캐시를 모두 비웁니다.\n다음 새로고침부터 Riot을 다시 호출하므로 호출량이 일시적으로 늘 수 있습니다.')) return;
    try {
      const { deleted } = await call<{ deleted: number }>('/api/admin?resource=cache', { method: 'POST' });
      alert(`캐시 ${deleted}건을 삭제했습니다.`);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const toggleBlock = async (u: AdminUser) => {
    if (!u.blocked && !confirm(`${u.name} 님을 차단하시겠습니까?\n(최대 30초 안에 접근이 막힙니다)`)) return;
    try {
      await call('/api/admin?resource=users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, blocked: !u.blocked }),
      });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteMember = async (m: AdminMember) => {
    if (!confirm(`${m.gameName}#${m.tagLine} 을(를) 소환사 목록에서 삭제하시겠습니까?`)) return;
    try {
      await onDeleteMember(m.id);
      await load();
    } catch {
      alert('삭제하지 못했습니다.');
    }
  };

  const ops = useOperations();
  const [tab, setTab] = useState<TabId>('overview');
  const configuration = !!status?.envProblems.length;
  const attention = Number(configuration) + (ops.data ? operationsLog(ops.data, ops.now)
    .filter((entry) => entry.level !== 'info' && !(configuration && entry.id === 'configuration')).length : 0);
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([load(), ops.refresh()]); }
    finally { setRefreshing(false); }
  };

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length].id;
    setTab(next);
    document.getElementById(`admin-tab-${next}`)?.focus();
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{ flex: '1 1 260px' }}>
          <h2 className="heading-1" style={styles.title}>관리자 대시보드</h2>
          <p className="subtitle">사용자, 등록 소환사 목록, 시스템 상태를 관리합니다.</p>
        </div>
        <button className="btn btn-secondary" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} disabled={loading || refreshing || ops.busy}
          onClick={refresh}>새로고침</button>
      </header>

      {loading && <p role="status" style={adminStyles.muted}>관리자 정보를 불러오는 중입니다.</p>}
      {error && <div role="alert" style={styles.error}>Error · 관리자 정보 조회 실패: {error}{status && ' · 이전 데이터를 표시하고 있습니다.'} 새로고침으로 다시 확인하세요.</div>}
      <OpsNotice ops={ops} />

      <div role="tablist" aria-label="관리자 메뉴" style={styles.tabs}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`admin-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`admin-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`segmented-tab${tab === t.id ? ' segmented-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}{t.id === 'overview' && attention > 0 && <span style={styles.count}> · 확인 {attention}건</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} style={styles.tabPanel}>
        {tab === 'overview' && (
          <>
            {status && status.envProblems.length > 0 && (
              <div style={styles.configuration}>
                <strong>Warning · 환경 설정 확인</strong>
                <p style={{ margin: '8px 0' }}>로그인·외부 연동에 영향을 줄 수 있습니다. 환경변수 설정을 확인하세요. 값은 표시하지 않습니다.</p>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  {status.envProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <OpsStatusPanel ops={ops} onOpenIntegrations={() => setTab('integrations')} />
            {status && (
              <section style={styles.cards}>
                <Card label="등록 소환사" value={`${status.counts.members}명`} />
                <Card label="사용자 / 차단" value={`${status.counts.users}명 / ${status.counts.blocked}명`} />
                <Card label="Riot 캐시" value={`${status.cache.fresh} / ${status.cache.rows}건`} sub={mb(status.cache.bytes)} />
                <Card
                  label="DB 사용량 (Neon 무료 한도 대비)"
                  value={`${mb(status.database.bytes)} / ${mb(DB_LIMIT_BYTES)}`}
                  ratio={status.database.bytes / DB_LIMIT_BYTES}
                />
                {status.stats[0] && <Card label="Riot 호출 (오늘)" value={`Riot ${status.stats[0].misses}회`} sub={`캐시 응답 ${status.stats[0].hits}회 · 적중률 ${hitRate(status.stats[0])}`} />}
                <Card
                  label="Riot 오류 (24시간)"
                  value={status.errorsByStatus.length ? status.errorsByStatus.map((e) => `${e.status}: ${e.count}`).join(', ') : '없음'}
                />
              </section>
            )}
            <Panel
              title="무료 한도 확인"
              actions={
                <div style={styles.links}>
                  <a className="btn btn-secondary" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Vercel 대시보드</a>
                  <a className="btn btn-secondary" href="https://console.neon.tech" target="_blank" rel="noreferrer">Neon 콘솔</a>
                </div>
              }
            >
              <p style={styles.cardLabel}>
                Vercel(함수 호출 월 100만 회, 전송량 100GB)과 Neon(연산 월 100 CU-시간)의 사용량은 각 서비스 화면에서 확인하세요.
              </p>
            </Panel>
          </>
        )}

        {tab === 'people' && (
          <>
            <Panel title={`사용자 (${status ? users.length : '—'})`}>
              <p style={adminStyles.muted}>로그인 이력 기준 · 마지막 로그인 시각은 한국 시간으로 표시합니다.</p>
              <ScrollTable head={['이름', '로그인 횟수', '마지막 로그인', '']}>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.td}>
                      {u.name}{u.username && <span style={styles.handle}> @{u.username}</span>} {u.isAdmin && <span className="badge-green-soft" style={{ whiteSpace: 'nowrap' }}>관리자</span>}{' '}
                      {u.blocked && <span style={styles.blocked}>차단됨</span>}
                    </td>
                    <td style={styles.td}>{u.loginCount}</td>
                    <td style={styles.td}>{when(u.lastLogin)}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      {!u.isAdmin && (
                        <button className="btn btn-secondary" onClick={() => toggleBlock(u)}>
                          {u.blocked ? '차단 해제' : '차단'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td style={styles.td} colSpan={4}>{loading ? '불러오는 중입니다.' : error ? '사용자 목록을 불러오지 못했습니다.' : '로그인한 사용자 기록이 없습니다.'}</td></tr>}
              </ScrollTable>
            </Panel>
            <Panel title={`등록 소환사 목록 (${status ? members.length : '—'})`}>
              <ScrollTable head={['Riot ID', '등록자', '등록일', '']}>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={styles.td}>{m.gameName}#{m.tagLine}</td>
                    <td style={styles.td}>{m.createdByName ?? (m.createdBy ? `디스코드 ID ${m.createdBy}` : '-')}</td>
                    <td style={styles.td}>{when(m.createdAt)}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <button className="btn btn-secondary" style={styles.danger} onClick={() => deleteMember(m)}>삭제</button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && <tr><td style={styles.td} colSpan={4}>{loading ? '불러오는 중입니다.' : error ? '소환사 목록을 불러오지 못했습니다.' : '등록된 소환사가 없습니다.'}</td></tr>}
              </ScrollTable>
            </Panel>
          </>
        )}

        {tab === 'integrations' && (
          <>
            {status && (
              <Panel title="Riot 호출 통계 (최근 7일)" actions={<button className="btn btn-secondary" style={styles.danger} onClick={purgeCache}>캐시 비우기</button>}>
                <ScrollTable head={['날짜', '캐시 응답', 'Riot 호출', '적중률']}>
                  {status.stats.map((d) => (
                    <tr key={d.day}>
                      <td style={styles.td}>{d.day}</td><td style={styles.td}>{d.hits}</td><td style={styles.td}>{d.misses}</td><td style={styles.td}>{hitRate(d)}</td>
                    </tr>
                  ))}
                  {status.stats.length === 0 && <tr><td style={styles.td} colSpan={4}>아직 기록이 없습니다.</td></tr>}
                </ScrollTable>
                {status.recentErrors.length > 0 && (
                  <details>
                    <summary>최근 Riot 오류 ({status.recentErrors.length})</summary>
                    <ScrollTable head={['시각', '상태', '경로']}>
                      {status.recentErrors.map((e) => (
                        <tr key={`${e.at}${e.path}`}>
                          <td style={styles.td}>{when(e.at)}</td>
                          <td style={styles.td}>{e.status}</td>
                          <td style={{ ...styles.td, wordBreak: 'break-all' }}>{e.path}</td>
                        </tr>
                      ))}
                    </ScrollTable>
                  </details>
                )}
              </Panel>
            )}
            <SteamPanel ops={ops} />
            <ChatSyncPanel ops={ops} />
          </>
        )}

        {tab === 'records' && (
          <>
            <ViewAnalytics />
            <AuditPanel ops={ops} />
            <BackupNote />
          </>
        )}
      </div>
    </div>
  );
};

const gaugeColor = (ratio: number) => (ratio >= 0.9 ? '#ff4a4a' : ratio >= 0.7 ? '#ffb703' : 'var(--primary)');

const Card: React.FC<{ label: string; value: string; sub?: string; ratio?: number }> = ({ label, value, sub, ratio }) => (
  <div style={styles.card}>
    <div style={styles.cardLabel}>{label}</div>
    <div style={styles.cardValue}>{value}</div>
    {ratio !== undefined && (
      <>
        <div style={styles.gaugeTrack}>
          <div style={{ ...styles.gaugeFill, width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: gaugeColor(ratio) }} />
        </div>
        <div style={styles.cardLabel}>{(ratio * 100).toFixed(1)}% 사용</div>
      </>
    )}
    {sub && <div style={styles.cardLabel}>{sub}</div>}
  </div>
);

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 'var(--page-padding)', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', minHeight: 0 },
  header: { flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--hairline)', paddingBottom: '20px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  error: { padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(255, 74, 74, 0.12)', color: '#ff4a4a', fontSize: '13.5px' },
  configuration: { padding: '12px 16px', borderRadius: 8, backgroundColor: 'var(--surface)', borderLeft: '4px solid var(--status-warning)', color: 'var(--status-warning)', fontSize: 14 },
  tabs: { flexShrink: 0, display: 'flex', gap: '4px', overflowX: 'auto', borderBottom: '1px solid var(--hairline)' },
  tabPanel: { flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 },
  count: { color: 'var(--accent-pink)', fontWeight: 700 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  card: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '8px', padding: '16px' },
  cardLabel: { fontSize: '12px', color: 'var(--slate)' },
  cardValue: { fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: '6px 0' },
  td: { padding: '12px', borderBottom: '1px solid var(--hairline)', overflowWrap: 'anywhere' },
  links: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
  gaugeTrack: { height: '6px', borderRadius: '3px', backgroundColor: 'var(--surface-soft)', margin: '8px 0', overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: '3px' },
  handle: { color: 'var(--slate)', fontSize: '12px' },
  blocked: { color: '#ff4a4a', fontSize: '12px', fontWeight: 600 },
  danger: adminStyles.danger,
};
