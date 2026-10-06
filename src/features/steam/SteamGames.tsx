'use client';

import { useEffect, useState } from 'react';
import { type GamesResult, type Mode, type SteamMember, steamApi, steamErrorMessage } from './api';
import { ServiceMark, UiIcon, VisualImage } from './VisualImage';

const hours = (minutes: number) => (minutes === 0 ? '0시간' : `${Math.max(1, Math.round(minutes / 60)).toLocaleString()}시간`);

export function SteamGames({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
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
  const visibleGames = result?.data.games.filter((g) => g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3 visual-heading" style={styles.title}><ServiceMark service="steam" size={36} />Steam 공통 게임</h2>
        <p style={styles.hint}>같이 할 사람을 고르면 모두가 가진 게임을 찾아 줍니다. 프로필의 &quot;게임 세부 정보&quot;가 공개여야 보입니다.</p>
      </header>

      {error && <div style={styles.error} role="alert">{error}</div>}

      <div className="steam-query-area">
        <label htmlFor="steam-game-query">결과에서 게임 찾기</label>
        <div className="game-search"><div className="game-search-field"><UiIcon name="search" /><input id="steam-game-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="게임 이름" maxLength={120} /></div>{query && <button className="btn btn-ghost" onClick={() => setQuery('')}>지우기</button>}</div>
        {!result && <p className="game-search-hint">함께할 멤버를 선택하고 비교하면{query.trim() ? ` “${query.trim()}”을(를)` : ' 게임을'} 결과에서 찾아요.</p>}
      </div>

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
                  <VisualImage src={m.avatar} fallback={m.name.slice(0, 1)} width={32} height={32} className="member-avatar" />
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
              <p style={styles.hint} role="status">{visibleGames.length.toLocaleString()}개{query.trim() && ` / 전체 ${result.data.games.length.toLocaleString()}개`} {result.mode === 'common' ? '(합산 플레이 시간 순)' : ''}</p>
              {visibleGames.length === 0 && <p style={styles.hint}>검색한 이름과 일치하는 게임이 없습니다. 검색어를 바꿔 보세요.</p>}
              <ul style={styles.gameList}>
                {visibleGames.map((g) => (
                  <li key={g.appId} style={styles.game}>
                    <VisualImage src={`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.appId}/header.jpg`} width={120} height={56} className="result-game-cover" />
                    <div className="result-game-info">
                    <span>{g.name}</span>
                    <span style={styles.time}>{hours(g.totalMinutes)}</span>
                    </div>
                    <a href={`https://store.steampowered.com/app/${g.appId}/`} target="_blank" rel="noopener noreferrer" className="btn btn-link" aria-label={`${g.name} Steam에서 보기`}><UiIcon name="box-arrow-up-right" /></a>
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
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  hint: { color: 'var(--slate)', fontSize: '13px' },
  warn: { color: 'var(--accent-pink)', fontSize: '13px' },
  error: { backgroundColor: '#fff8e0', color: '#946f3f', border: '1px solid #fa6e39', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' },
  panel: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  addRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' as const },
  btn: { padding: '8px 20px' },
  memberList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  member: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--ink)' },
  memberLabel: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' },
  avatar: { borderRadius: '50%' },
  removeBtn: { fontSize: '12px', padding: '4px 10px' },
  gameList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  game: { display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--hairline)', color: 'var(--ink)', fontSize: '14px' },
  time: { color: 'var(--slate)', whiteSpace: 'nowrap' as const, marginLeft: '16px' },
};
