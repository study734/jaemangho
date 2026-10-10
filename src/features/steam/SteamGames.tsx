'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Recommendation, type MissionsResult, type GamesResult, type Mode, type OwnershipScope, type Preference, type RecommendationsResult, type SteamMember, steamApi, steamErrorMessage } from './api';
import { drawGame } from './draw';
import { SteamActivitySettings } from './ActivitySettings';
import { ServiceMark, UiIcon, VisualImage } from './VisualImage';

const hours = (minutes: number) => (minutes === 0 ? '0시간' : `${Math.max(1, Math.round(minutes / 60)).toLocaleString()}시간`);
const duration = (minutes: number) => minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60).toLocaleString()}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`;
const randomRoll = () => Math.random();
const scopeLabels = { all: '모두 보유', any: '일부 보유 포함', unowned: '아무도 미보유' };

export function SteamGames({ initialQuery = '', linkResult }: { initialQuery?: string; linkResult?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [members, setMembers] = useState<SteamMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('common');
  const [result, setResult] = useState<{ mode: Mode; ids: string[]; data: GamesResult } | null>(null);
  const [preference, setPreference] = useState<Preference>('balanced');
  const [scope, setScope] = useState<OwnershipScope>('all');
  const [recommendations, setRecommendations] = useState<{ ids: string[]; preference: Preference; scope: OwnershipScope; data: RecommendationsResult } | null>(null);
  const [drawn, setDrawn] = useState<Recommendation | null>(null);
  const [missionResult, setMissionResult] = useState<{ game: Recommendation; data: MissionsResult } | null>(null);
  const resetExtras = () => { setDrawn(null); setMissionResult(null); };
  const [busy, setBusy] = useState<'add' | 'compare' | 'recommend' | 'remove' | 'missions' | null>(null);
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
    setRecommendations(null); resetExtras();
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
      setRecommendations(null); resetExtras();
    } catch (err) {
      setError(steamErrorMessage(err));
    } finally { setBusy(null); }
  };

  const compare = async () => {
    if (busy || !selected.length) return;
    setBusy('compare');
    setError(null);
    setRecommendations(null); resetExtras();
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
    setRecommendations(null); resetExtras();
    try {
      setRecommendations({ ids: [...selected], preference, scope, data: await steamApi.recommendations(selected, preference, scope) });
    } catch (err) {
      setError(steamErrorMessage(err));
    } finally { setBusy(null); }
  };

  const findMissions = async (game: Recommendation) => {
    if (busy || !recommendations || game.missingIds.length) return;
    setBusy('missions'); setError(null); setMissionResult(null);
    try { setMissionResult({ game, data: await steamApi.missions(recommendations.ids, game.appId) }); }
    catch (err) { setError(steamErrorMessage(err)); }
    finally { setBusy(null); }
  };

  const nameOf = (id: string) => members.find((m) => m.steamId === id)?.name ?? id;
  const visibleGames = result?.data.games.filter((g) => g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const visibleRecommendations = recommendations?.data.games.filter(g => g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3 visual-heading" style={styles.title}><ServiceMark service="steam" size={36} />같이 할 Steam 게임</h2>
        <p style={styles.hint}>함께할 사람을 고르고 보유 범위를 선택해 게임을 찾아요. 프로필의 &quot;게임 세부 정보&quot;가 공개여야 보유 여부를 확인할 수 있습니다.</p>
      </header>

      {error && <div style={styles.error} role="alert">{error}
        {members.length === 0 && <button className="btn btn-secondary" disabled={loading} onClick={loadMembers}>목록 다시 불러오기</button>}
      </div>}

      <div className="steam-query-area">
        <label htmlFor="steam-game-query">결과에서 게임 찾기</label>
        <div className="game-search"><div className="game-search-field"><UiIcon name="search" /><input id="steam-game-query" type="search" value={query} disabled={busy !== null} onChange={(e) => { setQuery(e.target.value); resetExtras(); }} placeholder="게임 이름" maxLength={120} /></div>{query && <button className="btn btn-ghost" disabled={busy !== null} onClick={() => { setQuery(''); resetExtras(); }}>지우기</button>}</div>
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
          <label htmlFor="steam-recommend-scope" style={styles.hint}>추천 범위</label>
          <select id="steam-recommend-scope" className="text-input" value={scope} disabled={busy !== null} onChange={e => { setScope(e.target.value as OwnershipScope); setRecommendations(null); resetExtras(); }}>
            <option value="all">모두 보유</option>
            <option value="any">일부 보유 포함</option>
            <option value="unowned">아무도 미보유</option>
          </select>
          <label htmlFor="steam-recommend-preference" style={styles.hint}>오늘은 어떤 게임?</label>
          <select id="steam-recommend-preference" className="text-input" value={scope === 'unowned' ? 'discovery' : preference} disabled={busy !== null || scope === 'unowned'} onChange={e => { setPreference(e.target.value as Preference); setRecommendations(null); resetExtras(); }}>
            {scope === 'unowned' && <option value="discovery">Steam 인기·신규 목록 순</option>}
            <option value="balanced">경험이 비슷한 게임</option>
            <option value="familiar">익숙한 게임</option>
            <option value="fresh">새로 해 볼 게임</option>
            <option value="recent">요즘 크루픽 (최근 2주)</option>
          </select>
          <button className="btn btn-primary" style={styles.btn} disabled={busy !== null || selected.length < 2} onClick={recommend}>
            {busy === 'recommend' ? '추천 찾는 중...' : `추천받기 (${selected.length}명)`}
          </button>
        </div>
        <p style={styles.hint}>2~20명을 선택해 주세요. {scope === 'all' ? '모두 보유한 게임만 추천해요.' : scope === 'any' ? '한 명 이상 보유한 게임을 포함하고, 보유 목록에 없는 멤버를 표시해요.' : 'Steam 인기·신규 목록에서 전원의 보유 목록에 없는 게임을 찾아요. 플레이 경험 기준은 적용하지 않아요.'} 멀티플레이·협동 지원을 확인해요.</p>

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
          <p style={styles.hint}>추천 범위: {scopeLabels[recommendations.scope]} · {recommendations.ids.map(nameOf).join(', ')}</p>
          <p style={styles.hint}>추천 기준: {recommendations.scope === 'unowned' ? 'Steam 인기·신규 목록 순' : ({ balanced: '경험이 비슷한 게임', familiar: '익숙한 게임', fresh: '새로 해 볼 게임', recent: '요즘 크루픽 (최근 2주)' })[recommendations.preference]}</p>
          {recommendations.data.excluded.length > 0 ? (
            <p style={styles.warn} role="status">게임 목록을 확인할 수 없는 사람: {recommendations.data.excluded.map(nameOf).join(', ')}. 전원의 보유 목록을 확인할 수 없어 추천을 보류했어요. 게임 세부 정보를 공개하거나 선택을 바꿔 주세요.</p>
          ) : (
            <>
              <p style={styles.hint}>{recommendations.scope === 'all' ? '공통 보유' : recommendations.scope === 'any' ? '한 명 이상 보유한 후보' : 'Steam 인기·신규 미보유 후보'} {recommendations.data.totalCandidates.toLocaleString()}개 중 {recommendations.scope === 'unowned' ? '목록 순' : recommendations.preference === 'recent' ? '최근 활동 기준 상위' : '플레이 경험 기준 상위'} {recommendations.data.checked}개의 지원 방식을 확인했어요. 최대 12개를 추천해요.</p>
              {recommendations.data.unverified > 0 && <p style={styles.warn} role="status">스토어 정보를 확인하지 못한 {recommendations.data.unverified}개는 추천에서 제외했어요. 잠시 후 다시 추천받아 보세요.</p>}
              {(recommendations.data.recentUnavailable ?? []).length > 0 && <p style={styles.warn} role="status">최근 기록을 확인할 수 없는 사람: {recommendations.data.recentUnavailable.map(nameOf).join(', ')}. 확인된 기록만 반영했어요.</p>}
              <p style={styles.hint}>최대 인원과 온라인 플레이 방식은 Steam에서 확인해 주세요. 플레이 시간은 실력을 뜻하지 않아요.</p>
              {recommendations.scope === 'unowned' ? <p style={styles.hint}>Steam 전체 게임을 검색한 결과는 아니에요. 플레이 기록이 없는 후보에는 경험 점수를 표시하지 않아요. 무료 게임은 보유 목록에 없어도 시작할 수 있으니 Steam에서 확인해 주세요.</p> :
                recommendations.preference === 'recent' ? <details style={styles.hint}><summary>추천 점수는 어떻게 정하나요?</summary><p>최근 2주 플레이한 멤버 비율 70%와 플레이 시간 30%를 반영해요. 시간은 로그로 반영하고 합계 14시간에서 상한을 두며 보유 비율을 적용해요. 확인할 수 없는 기록은 미플레이로 확정하지 않아요.</p></details> : <details style={styles.hint}><summary>추천 점수는 어떻게 정하나요?</summary><p>보유자의 플레이 경험, 경험 차이, 새로움에 선택한 기준의 가중치를 적용하고 선택한 멤버의 보유 비율을 반영해요. 미보유자의 경험은 추측하지 않아요. 플레이 경험은 8시간까지 반영하고, 점수는 후보 비교용이며 만족 확률이 아니에요. 경험이 비슷한 게임은 경험 40%·균형 40%·새로움 20%, 익숙한 게임은 70%·20%·10%, 새로 해 볼 게임은 10%·20%·70%예요.</p></details>}
              <p style={styles.hint} role="status">추천 {visibleRecommendations.length}개{query.trim() && ` / 전체 ${recommendations.data.games.length}개`}</p>
              {recommendations.data.games.length === 0 ? <p style={styles.hint}>{recommendations.data.totalCandidates === 0 ? (recommendations.preference === 'recent' && recommendations.scope !== 'unowned' ? '확인된 최근 2주 플레이 후보가 없어요. 최근 기록 공개 여부를 확인하거나 기준을 바꿔 보세요.' : recommendations.scope === 'all' ? '선택한 모두가 가진 게임이 없어요. 멤버 선택을 바꿔 보세요.' : recommendations.scope === 'any' ? '선택한 멤버의 보유 게임 후보가 없어요.' : '현재 Steam 인기·신규 목록에 전원의 보유 목록에 없는 후보가 없어요.') : '검사한 후보에서 멀티플레이·협동 지원을 확인한 게임이 없어요. 추천 범위나 기준을 바꾸거나 공통 게임을 비교해 보세요.'}</p>
                : visibleRecommendations.length === 0 && <p style={styles.hint}>검색한 이름과 일치하는 추천이 없습니다. 검색어를 바꿔 보세요.</p>}
              {visibleRecommendations.length > 0 && <button className="btn btn-primary" disabled={busy !== null} onClick={() => setDrawn(drawGame(visibleRecommendations, drawn?.appId ?? null, randomRoll()))}>{drawn ? '다시 뽑기' : '오늘의 게임 뽑기'}</button>}
              {drawn && <div style={styles.extra} role="status"><h4>오늘의 게임: {drawn.name}</h4><p style={styles.hint}>{drawn.reasons.join(' · ')}</p><p style={styles.hint}>현재 검색 결과에서 같은 확률로 뽑아요. 후보가 둘 이상이면 직전 게임을 제외해요.</p><a className="btn btn-link" href={`https://store.steampowered.com/app/${drawn.appId}/`} target="_blank" rel="noopener noreferrer">뽑은 게임 Steam에서 확인</a></div>}
              <ol className="steam-recommendations" style={styles.gameList}>
                {visibleRecommendations.map(g => (
                  <li key={g.appId} className="steam-recommendation" style={styles.game}>
                    <VisualImage src={`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.appId}/header.jpg`} fallback={g.name} width={160} height={75} className="result-game-cover" />
                    <div className="result-game-info">
                      <strong>{g.name}</strong>
                      <span style={styles.recommendScore}>{g.support === 'coop' ? '협동 지원' : '멀티플레이 지원'}{g.score !== null && ` · 추천 점수 ${g.score}`}</span>
                      <ul className="steam-recommend-reasons">{g.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                      {g.missingIds.length > 0 && <span style={styles.warn}>보유 목록에 없는 멤버: {g.missingIds.map(nameOf).join(', ')}</span>}
                      {g.recentPlayers !== undefined && <span style={styles.hint}>최근 2주 {g.recentPlayers}명 · 합계 {duration(g.recentMinutes ?? 0)}</span>}
                      <button className="btn btn-secondary" disabled={busy !== null || g.missingIds.length > 0} onClick={() => findMissions(g)} aria-label={`${g.name} 같이 도전 찾기`}>{busy === 'missions' ? '도전 확인 중...' : '같이 도전 찾기'}</button>
                      {g.missingIds.length > 0 && <span style={styles.hint}>도전 과제는 모두 보유한 게임에서 찾아요.</span>}
                      {g.owners > 0 && <span style={styles.hint}>{g.owners === recommendations.ids.length ? '개인별' : '보유자별'} 플레이 {duration(g.minMinutes)} ~ {duration(g.maxMinutes)} · 합계 {duration(g.totalMinutes)}</span>}
                    </div>
                    <a href={`https://store.steampowered.com/app/${g.appId}/`} target="_blank" rel="noopener noreferrer" className="btn btn-link" aria-label={`${g.name} 인원과 플레이 방식 확인`}>Steam에서 확인 <UiIcon name="box-arrow-up-right" /></a>
                  </li>
                ))}
              </ol>
              {missionResult && <div style={styles.extra} aria-live="polite">
                <h4>함께할 도전 과제 · {missionResult.game.name}</h4>
                <p style={styles.hint}>공개 과제만 비교해요. 게임 내 협동 달성 가능 여부와 조건은 직접 확인해 주세요.</p>
                {missionResult.data.state === 'ok' ? <>
                  <p style={styles.hint}>공개 과제 {missionResult.data.totalPublic}개 · 모두 달성 {missionResult.data.completedTogether}개 · 진행도 미확인 {missionResult.data.unknownAchievements}개</p>
                  <ul style={styles.gameList}>{missionResult.data.missions.map(m => <li key={m.id} style={styles.mission}>
                    <strong>{m.kind === 'team-first' ? '팀 첫 도전' : '따라잡기'} · {m.title}</strong>
                    {m.description && <p style={styles.hint}>{m.description}</p>}
                    {m.unlockedIds.length > 0 && <p style={styles.hint}>이미 달성: {m.unlockedIds.map(nameOf).join(', ')}</p>}
                    <p style={styles.hint}>아직 남은 멤버: {m.lockedIds.map(nameOf).join(', ')}</p>
                  </li>)}</ul>
                </> : <p style={styles.hint}>{({ unsupported: '공개된 도전 과제가 없는 게임이에요.', unavailable: '일부 진행도를 확인할 수 없어요. 게임 세부 정보 공개 여부를 확인해 주세요.', 'not-owned': '지금은 모두 보유한 게임이 아니에요. 다시 추천받아 주세요.', complete: '확인된 공개 과제를 모두 함께 달성했어요!' })[missionResult.data.state]}</p>}
                {missionResult.data.unavailableIds.length > 0 && <p style={styles.warn}>확인 불가: {missionResult.data.unavailableIds.map(nameOf).join(', ')}</p>}
                <button className="btn btn-secondary" disabled={busy !== null} onClick={() => findMissions(missionResult.game)}>도전 다시 확인</button>
              </div>}
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
      <SteamActivitySettings linkResult={linkResult} />
    </div>
  );
}

const styles = {
  extra: { borderTop: '1px solid var(--hairline)', paddingTop: '16px', overflowWrap: 'anywhere' as const },
  mission: { padding: '12px 0', borderBottom: '1px solid var(--hairline)', overflowWrap: 'anywhere' as const },
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
