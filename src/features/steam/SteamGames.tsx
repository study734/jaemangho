'use client';

import { useCallback, useEffect, useState } from 'react';
import { type GamesResult, type Mode, type Preference, type RecommendationsResult, type SteamMember, steamApi, steamErrorMessage } from './api';
import { ServiceMark, UiIcon, VisualImage } from './VisualImage';

const hours = (minutes: number) => (minutes === 0 ? '0시간' : `${Math.max(1, Math.round(minutes / 60)).toLocaleString()}시간`);
const duration = (minutes: number) => minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60).toLocaleString()}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`;

export function SteamGames({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [members, setMembers] = useState<SteamMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('common');
  const [result, setResult] = useState<{ mode: Mode; ids: string[]; data: GamesResult } | null>(null);
  const [preference, setPreference] = useState<Preference>('balanced');
  const [recommendations, setRecommendations] = useState<{ ids: string[]; preference: Preference; data: RecommendationsResult } | null>(null);
  const [busy, setBusy] = useState<'add' | 'compare' | 'recommend' | 'remove' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true); setError(null);
    try { setMembers(await steamApi.list()); }
    catch (e) { setError(steamErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadMembers); }, [loadMembers]);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setResult(null);
    setRecommendations(null);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || loading || !input.trim()) return;
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
    if (busy || !confirm(`${nameOf(id)}님을 공용 비교 목록에서 삭제할까요? Steam 계정과 보유 게임에는 영향이 없습니다.`)) return;
    setBusy('remove');
    setError(null);
    try {
      await steamApi.remove(id);
      setMembers((list) => list.filter((m) => m.steamId !== id));
      setSelected((s) => s.filter((x) => x !== id));
      setResult(null);
      setRecommendations(null);
    } catch (err) {
      setError(steamErrorMessage(err));
    } finally { setBusy(null); }
  };

  const compare = async () => {
    if (busy || !selected.length) return;
    setBusy('compare');
    setError(null);
    setRecommendations(null);
    try {
      setResult({ mode, ids: [...selected], data: await steamApi.games(selected, mode) });
    } catch (err) {
      setResult(null);
      setError(steamErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const recommend = async () => {
    if (busy || selected.length < 2) return;
    setBusy('recommend');
    setError(null);
    setResult(null);
    setRecommendations(null);
    try {
      setRecommendations({ ids: [...selected], preference, data: await steamApi.recommendations(selected, preference) });
    } catch (err) {
      setError(steamErrorMessage(err));
    } finally { setBusy(null); }
  };

  const nameOf = (id: string) => members.find((m) => m.steamId === id)?.name ?? id;
  const visibleGames = result?.data.games.filter((g) => g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const visibleRecommendations = recommendations?.data.games.filter(g => g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3 visual-heading" style={styles.title}><ServiceMark service="steam" size={36} />같이 할 Steam 게임</h2>
        <p style={styles.hint}>함께할 사람을 고르면 공통 보유 게임과 각자의 플레이 경험을 바탕으로 추천해요. 프로필의 &quot;게임 세부 정보&quot;가 공개여야 보입니다.</p>
      </header>

      {error && <div style={styles.error} role="alert">{error}
        {members.length === 0 && <button className="btn btn-secondary" disabled={loading} onClick={loadMembers}>목록 다시 불러오기</button>}
      </div>}

      <div className="steam-query-area">
        <label htmlFor="steam-game-query">결과에서 게임 찾기</label>
        <div className="game-search"><div className="game-search-field"><UiIcon name="search" /><input id="steam-game-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="게임 이름" maxLength={120} /></div>{query && <button className="btn btn-ghost" onClick={() => setQuery('')}>지우기</button>}</div>
        {!result && !recommendations && <p className="game-search-hint">함께할 멤버를 선택하고 비교하거나 추천받으면{query.trim() ? ` “${query.trim()}”을(를)` : ' 게임을'} 결과에서 찾아요.</p>}
      </div>

      <section style={styles.panel}>
        <label htmlFor="steam-profile-input" style={styles.hint}>Steam 프로필</label>
        <form onSubmit={add} style={styles.addRow} className="steam-add-row">
          <input
            id="steam-profile-input"
            aria-describedby="steam-profile-help"
            className="text-input"
            style={{ flexGrow: 1 }}
            placeholder="Steam 프로필 주소, 이름 또는 17자리 ID"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={200}
            aria-label="Steam 프로필"
          />
          <button className="btn btn-primary" style={styles.btn} disabled={loading || busy !== null || !input.trim()}>
            {busy === 'add' ? '찾는 중...' : '추가'}
          </button>
        </form>
        <p id="steam-profile-help" style={styles.hint}>프로필 주소나 이름, 17자리 ID를 입력해요.</p>

        {loading ? <p style={styles.hint} role="status">Steam 멤버 목록을 불러오는 중입니다.</p> : members.length === 0 && !error ? (
          <p style={styles.hint}>아직 등록된 사람이 없습니다.</p>
        ) : (
          <ul style={styles.memberList}>
            {members.map((m) => (
              <li key={m.steamId} style={styles.member}>
                <label style={styles.memberLabel}>
                  <input type="checkbox" disabled={busy !== null || (selected.length >= 20 && !selected.includes(m.steamId))} checked={selected.includes(m.steamId)} onChange={() => toggle(m.steamId)} />
                  <VisualImage src={m.avatar} fallback={m.name.slice(0, 1)} width={32} height={32} className="member-avatar" />
                  <span>{m.name}</span>
                </label>
                <button className="btn btn-ghost" style={styles.removeBtn} disabled={busy !== null} onClick={() => remove(m.steamId)} aria-label={`${m.name} 삭제`}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={styles.addRow} className="steam-compare-row">
          <label htmlFor="steam-recommend-preference" style={styles.hint}>오늘은 어떤 게임?</label>
          <select id="steam-recommend-preference" className="text-input" value={preference} disabled={busy !== null} onChange={e => { setPreference(e.target.value as Preference); setRecommendations(null); }}>
            <option value="balanced">경험이 비슷한 게임</option>
            <option value="familiar">익숙한 게임</option>
            <option value="fresh">새로 해 볼 게임</option>
          </select>
          <button className="btn btn-primary" style={styles.btn} disabled={busy !== null || selected.length < 2} onClick={recommend}>
            {busy === 'recommend' ? '추천 찾는 중...' : `추천받기 (${selected.length}명)`}
          </button>
        </div>
        <p style={styles.hint}>2~20명을 선택해 주세요. 추천은 전원의 보유 여부와 Steam의 멀티플레이·협동 지원을 확인해요.</p>

        <div style={styles.addRow} className="steam-compare-row">
          <select className="text-input" value={mode} disabled={busy !== null} onChange={(e) => { setMode(e.target.value as Mode); setResult(null); }} aria-label="찾을 게임 종류">
            <option value="common">모두가 가진 게임</option>
            <option value="unplayed">모두 가졌지만 아무도 안 해 본 게임</option>
          </select>
          <button className="btn btn-secondary" style={styles.btn} disabled={busy !== null || selected.length === 0} onClick={compare}>
            {busy === 'compare' ? '비교 중...' : `비교하기 (${selected.length}명)`}
          </button>
        </div>
      </section>

      {recommendations && (
        <section style={styles.panel} aria-labelledby="steam-recommend-title">
          <h3 id="steam-recommend-title" style={styles.recommendTitle}>오늘 같이 할 게임</h3>
          <p style={styles.hint}>추천 기준: {({ balanced: '경험이 비슷한 게임', familiar: '익숙한 게임', fresh: '새로 해 볼 게임' })[recommendations.preference]} · {recommendations.ids.map(nameOf).join(', ')}</p>
          {recommendations.data.excluded.length > 0 ? (
            <p style={styles.warn} role="status">게임 목록을 확인할 수 없는 사람: {recommendations.data.excluded.map(nameOf).join(', ')}. 전원의 보유 여부를 확인할 수 없어 추천을 보류했어요. 게임 세부 정보를 공개하거나 선택을 바꿔 주세요.</p>
          ) : (
            <>
              <p style={styles.hint}>공통 보유 {recommendations.data.totalCommon.toLocaleString()}개 중 플레이 경험 기준 상위 {recommendations.data.checked}개의 지원 방식을 확인했어요. 최대 12개를 추천해요.</p>
              {recommendations.data.unverified > 0 && <p style={styles.warn} role="status">스토어 정보를 확인하지 못한 {recommendations.data.unverified}개는 추천에서 제외했어요. 잠시 후 다시 추천받아 보세요.</p>}
              <p style={styles.hint}>최대 인원과 온라인 플레이 방식은 Steam에서 확인해 주세요. 플레이 시간은 실력을 뜻하지 않아요.</p>
              <details style={styles.hint}><summary>추천 점수는 어떻게 정하나요?</summary><p>각자의 플레이 경험, 경험 차이, 새로움에 선택한 기준의 가중치를 적용해요. 플레이 경험은 8시간까지 반영하고, 점수는 후보 비교용이며 만족 확률이 아니에요. 경험이 비슷한 게임은 경험 40%·균형 40%·새로움 20%, 익숙한 게임은 70%·20%·10%, 새로 해 볼 게임은 10%·20%·70%예요.</p></details>
              <p style={styles.hint} role="status">추천 {visibleRecommendations.length}개{query.trim() && ` / 전체 ${recommendations.data.games.length}개`}</p>
              {recommendations.data.games.length === 0 ? <p style={styles.hint}>{recommendations.data.totalCommon === 0 ? '선택한 모두가 가진 게임이 없어요. 멤버 선택을 바꿔 보세요.' : '검사한 후보에서 멀티플레이·협동 지원을 확인한 게임이 없어요. 추천 기준을 바꾸거나 공통 게임을 비교해 보세요.'}</p>
                : visibleRecommendations.length === 0 && <p style={styles.hint}>검색한 이름과 일치하는 추천이 없습니다. 검색어를 바꿔 보세요.</p>}
              <ol className="steam-recommendations" style={styles.gameList}>
                {visibleRecommendations.map(g => (
                  <li key={g.appId} className="steam-recommendation" style={styles.game}>
                    <VisualImage src={`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.appId}/header.jpg`} fallback={g.name} width={160} height={75} className="result-game-cover" />
                    <div className="result-game-info">
                      <strong>{g.name}</strong>
                      <span style={styles.recommendScore}>{g.support === 'coop' ? '협동 지원' : '멀티플레이 지원'} · 추천 점수 {g.score}</span>
                      <ul className="steam-recommend-reasons">{g.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                      <span style={styles.hint}>개인별 플레이 {duration(g.minMinutes)} ~ {duration(g.maxMinutes)} · 합계 {duration(g.totalMinutes)}</span>
                    </div>
                    <a href={`https://store.steampowered.com/app/${g.appId}/`} target="_blank" rel="noopener noreferrer" className="btn btn-link" aria-label={`${g.name} 인원과 플레이 방식 확인`}>Steam에서 확인 <UiIcon name="box-arrow-up-right" /></a>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {result && (
        <section style={styles.panel}>
          <p style={styles.hint}>비교한 사람: {result.ids.map(nameOf).join(', ')}</p>
          {result.data.excluded.length > 0 && (
            <p style={styles.warn}>
              게임 목록이 비공개라 빠진 사람: {result.data.excluded.map(nameOf).join(', ')} (Steam 프로필의 게임 세부 정보를 공개로 바꿔야 합니다)
            </p>
          )}
          {result.data.games.length === 0 ? (
            <p style={styles.hint}>{result.data.excluded.length === result.ids.length ? '공개된 게임 목록이 없어 비교할 수 없습니다.' : result.mode === 'common' ? '모두가 가진 게임이 없습니다.' : '조건에 맞는 게임이 없습니다.'}</p>
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
  container: { padding: 'var(--page-padding)', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  recommendTitle: { color: 'var(--ink)', fontSize: '20px' },
  recommendScore: { color: 'var(--primary)', fontSize: '13px' },
  hint: { color: 'var(--slate)', fontSize: '13px' },
  warn: { color: 'var(--accent-pink)', fontSize: '13px' },
  error: { backgroundColor: '#fff8e0', color: '#946f3f', border: '1px solid #fa6e39', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' },
  panel: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '12px', padding: 'var(--panel-padding)', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  addRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' as const },
  btn: { padding: '8px 20px' },
  memberList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  member: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', color: 'var(--ink)' },
  memberLabel: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, minWidth: 0, overflowWrap: 'anywhere' as const, minHeight: '44px' },
  avatar: { borderRadius: '50%' },
  removeBtn: { fontSize: '12px', padding: '4px 10px', flexShrink: 0, whiteSpace: 'nowrap' as const, minWidth: '44px' },
  gameList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  game: { display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--hairline)', color: 'var(--ink)', fontSize: '14px' },
  time: { color: 'var(--slate)', whiteSpace: 'nowrap' as const, marginLeft: '16px' },
};
