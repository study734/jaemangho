import React, { useCallback, useEffect, useState } from 'react';
import { rosterApi } from '../api/roster';

interface Status {
  cache: { rows: number; fresh: number; bytes: number };
  database: { bytes: number };
  counts: { members: number; users: number; blocked: number; admins: number };
  errorsByStatus: { status: number; count: number }[];
  recentErrors: { at: string; status: number; path: string }[];
}
interface AdminUser {
  id: string;
  name: string;
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
  createdByName: string | null;
}

interface Props {
  // 관리자가 명단에서 삭제하면 앱의 화면 상태도 맞춘다
  onMemberDeleted: (id: string) => void;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR');

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `요청 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

export const AdminDashboard: React.FC<Props> = ({ onMemberDeleted }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

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
    if (!confirm(`${m.gameName}#${m.tagLine} 을(를) 크루원 명단에서 삭제하시겠습니까?`)) return;
    try {
      await rosterApi.remove(m.id);
      onMemberDeleted(m.id);
      await load();
    } catch {
      alert('삭제하지 못했습니다.');
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>관리자 대시보드</h2>
          <p className="subtitle">접속자, 크루원 명단, 시스템 상태를 관리합니다.</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>새로고침</button>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      {status && (
        <section style={styles.cards}>
          <Card label="크루원" value={`${status.counts.members}명`} />
          <Card label="접속자 / 차단" value={`${status.counts.users}명 / ${status.counts.blocked}명`} />
          <Card label="Riot 캐시" value={`${status.cache.fresh} / ${status.cache.rows}건`} sub={mb(status.cache.bytes)} />
          <Card label="DB 사용량" value={mb(status.database.bytes)} />
          <Card
            label="Riot 오류 (24시간)"
            value={status.errorsByStatus.length ? status.errorsByStatus.map((e) => `${e.status}: ${e.count}`).join(', ') : '없음'}
          />
        </section>
      )}

      <section className="card-base" style={styles.panel}>
        <h3 className="heading-3" style={styles.panelTitle}>접속자 ({users.length})</h3>
        <table style={styles.table}>
          <thead>
            <tr><th style={styles.th}>이름</th><th style={styles.th}>접속 횟수</th><th style={styles.th}>마지막 접속</th><th style={styles.th} /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={styles.td}>
                  {u.name} {u.isAdmin && <span className="badge-green-soft">관리자</span>}{' '}
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
          </tbody>
        </table>
      </section>

      <section className="card-base" style={styles.panel}>
        <h3 className="heading-3" style={styles.panelTitle}>크루원 명단 ({members.length})</h3>
        <table style={styles.table}>
          <thead>
            <tr><th style={styles.th}>Riot ID</th><th style={styles.th}>등록자</th><th style={styles.th}>등록일</th><th style={styles.th} /></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={styles.td}>{m.gameName}#{m.tagLine}</td>
                <td style={styles.td}>{m.createdByName ?? '-'}</td>
                <td style={styles.td}>{when(m.createdAt)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <button className="btn btn-secondary" style={styles.danger} onClick={() => deleteMember(m)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {status && status.recentErrors.length > 0 && (
        <section className="card-base" style={styles.panel}>
          <h3 className="heading-3" style={styles.panelTitle}>최근 Riot 오류</h3>
          <table style={styles.table}>
            <tbody>
              {status.recentErrors.map((e) => (
                <tr key={`${e.at}${e.path}`}>
                  <td style={styles.td}>{when(e.at)}</td>
                  <td style={styles.td}>{e.status}</td>
                  <td style={{ ...styles.td, wordBreak: 'break-all' }}>{e.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};

const Card: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="card-base" style={styles.card}>
    <div style={styles.cardLabel}>{label}</div>
    <div style={styles.cardValue}>{value}</div>
    {sub && <div style={styles.cardLabel}>{sub}</div>}
  </div>
);

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '32px', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', height: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1c4558', paddingBottom: '20px' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  error: { padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(255, 74, 74, 0.12)', color: '#ff4a4a', fontSize: '13.5px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  card: { backgroundColor: '#001e2b', border: '1px solid #1c4558', padding: '16px' },
  cardLabel: { fontSize: '12px', color: '#7c8c9a' },
  cardValue: { fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '6px 0' },
  panel: { backgroundColor: '#001e2b', border: '1px solid #1c4558', padding: '24px' },
  panelTitle: { color: '#ffffff', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', color: '#e1e5e8' },
  th: { textAlign: 'left', padding: '8px 12px', color: '#7c8c9a', fontWeight: 600, borderBottom: '1px solid #1c4558' },
  td: { padding: '10px 12px', borderBottom: '1px solid #143747' },
  blocked: { color: '#ff4a4a', fontSize: '12px', fontWeight: 600 },
  danger: { borderColor: '#ff4a4a', color: '#ff4a4a' },
};
