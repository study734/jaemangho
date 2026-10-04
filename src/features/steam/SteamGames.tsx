'use client';

import { useEffect, useState } from 'react';
import { type GamesResult, type Mode, type SteamMember, steamApi, steamErrorMessage } from './api';

const hours = (minutes: number) => (minutes === 0 ? '0시간' : `${Math.max(1, Math.round(minutes / 60)).toLocaleString()}시간`);

export function SteamGames() {
  const [members, setMembers] = useState<SteamMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('common');
  const [result, setResult] = useState<{ mode: Mode; data: GamesResult } | null>(null);
  const [busy, setBusy] = useState<'add' | 'compare' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    steamApi.list().then(setMembers, (e) => setError(steamErrorMessage(e)));
  }, []);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy('add');
    setError(null);
    try {
      const m = await steamApi.add(input.trim());
      setMembers((list) => [m, ...list]);
      setInput('');
    } catch (err) {
      setError(steamErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 사람을 목록에서 삭제할까요?')) return;
    setError(null);
    try {
      await steamApi.remove(id);
      setMembers((list) => list.filter((m) => m.steamId !== id));
      setSelected((s) => s.filter((x) => x !== id));
      setResult(null);
    } catch (err) {
      setError(steamErrorMessage(err));
    }
  };

  const compare = async () => {
    setBusy('compare');
    setError(null);
    try {
      setResult({ mode, data: await steamApi.games(selected, mode) });
    } catch (err) {
      setResult(null);
      setError(steamErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (id: string) => members.find((m) => m.steamId === id)?.name ?? id;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>Steam 공통 게임</h2>
        <p style={styles.hint}>같이 할 사람을 고르면 모두가 가진 게임을 찾아 줍니다. 프로필의 &quot;게임 세부 정보&quot;가 공개여야 보입니다.</p>
      </header>

      {error && <div style={styles.error} role="alert">{error}</div>}

      <section style={styles.panel}>
        <form onSubmit={add} style={styles.addRow}>
          <input
            className="text-input"
            style={{ flexGrow: 1 }}
            placeholder="Steam 프로필 주소, 이름 또는 17자리 ID"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={200}
            aria-label="Steam 프로필"
          />
          <button className="btn btn-primary" style={styles.btn} disabled={busy !== null || !input.trim()}>
            {busy === 'add' ? '찾는 중...' : '추가'}
          </button>
        </form>

        {members.length === 0 ? (
          <p style={styles.hint}>아직 등록된 사람이 없습니다.</p>
        ) : (
          <ul style={styles.memberList}>
            {members.map((m) => (
              <li key={m.steamId} style={styles.member}>
                <label style={styles.memberLabel}>
                  <input type="checkbox" checked={selected.includes(m.steamId)} onChange={() => toggle(m.steamId)} />
                  {m.avatar && <img src={m.avatar} alt="" width={28} height={28} style={styles.avatar} />}
                  <span>{m.name}</span>
                </label>
                <button className="btn btn-ghost" style={styles.removeBtn} onClick={() => remove(m.steamId)} aria-label={`${m.name} 삭제`}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={styles.addRow}>
          <select className="text-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="찾을 게임 종류">
            <option value="common">모두가 가진 게임</option>
            <option value="unplayed">모두 가졌지만 아무도 안 해 본 게임</option>
          </select>
          <button className="btn btn-primary" style={styles.btn} disabled={busy !== null || selected.length === 0} onClick={compare}>
            {busy === 'compare' ? '비교 중...' : `비교하기 (${selected.length}명)`}
          </button>
        </div>
      </section>

      {result && (
        <section style={styles.panel}>
          {result.data.excluded.length > 0 && (
            <p style={styles.warn}>
              게임 목록이 비공개라 빠진 사람: {result.data.excluded.map(nameOf).join(', ')} (Steam 프로필의 게임 세부 정보를 공개로 바꿔야 합니다)
            </p>
          )}
          {result.data.games.length === 0 ? (
            <p style={styles.hint}>{result.mode === 'common' ? '모두가 가진 게임이 없습니다.' : '조건에 맞는 게임이 없습니다.'}</p>
          ) : (
            <>
              <p style={styles.hint}>{result.data.games.length.toLocaleString()}개 {result.mode === 'common' ? '(합산 플레이 시간 순)' : ''}</p>
              <ul style={styles.gameList}>
                {result.data.games.map((g) => (
                  <li key={g.appId} style={styles.game}>
                    <span>{g.name}</span>
                    <span style={styles.time}>{hours(g.totalMinutes)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '32px', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid #1c4558', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  hint: { color: '#a8b3bc', fontSize: '13px' },
  warn: { color: '#ffb703', fontSize: '13px' },
  error: { backgroundColor: '#fff8e0', color: '#946f3f', border: '1px solid #fa6e39', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' },
  panel: { backgroundColor: '#001e2b', border: '1px solid #1c4558', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  addRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' as const },
  btn: { padding: '8px 20px' },
  memberList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  member: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff' },
  memberLabel: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' },
  avatar: { borderRadius: '50%' },
  removeBtn: { fontSize: '12px', padding: '4px 10px' },
  gameList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  game: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1c4558', color: '#ffffff', fontSize: '14px' },
  time: { color: '#a8b3bc', whiteSpace: 'nowrap' as const, marginLeft: '16px' },
};
