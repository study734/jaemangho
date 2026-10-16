'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import type { GameTaste, PersonalResult } from './personalTypes';
import { createPersonalModel } from './personalModel';
import { VisualImage } from './VisualImage';

export function PersonalRecommendations({ renderAnalysis }: { renderAnalysis?: (result: PersonalResult) => ReactNode }) {
  const [model] = useState(createPersonalModel);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getServerSnapshot);
  const { settings, taste, saved, kind, selected, scope, solo, result, busy, error, status } = state;
  const [recordGame, setRecordGame] = useState('');
  useEffect(() => { void model.load(); return () => model.cancel(); }, [model]);
  const nameOf = (id: string) => settings?.members.find(member => member.steamId === id)?.name ?? '등록 해제된 멤버';
  const change = (patch: Partial<GameTaste>) => model.setTaste({ ...taste, ...patch });
  const setTag = (tag: string, value: string) => change({ likes: [...taste.likes.filter(item => item !== tag), ...(value === 'like' ? [tag] : [])], avoids: [...taste.avoids.filter(item => item !== tag), ...(value === 'avoid' ? [tag] : [])] });
  const dirty = JSON.stringify(taste) !== JSON.stringify(saved);
  const ownSelected = settings?.members.some(member => member.own && selected.includes(member.steamId));
  const valid = kind === 'personal' ? selected.length === 1 && ownSelected : selected.length >= 2;

  return <section className="personal-recommendations">
    <header><h2 className="heading-3">취향으로 게임 찾기</h2><p className="personal-muted">내 플레이 기록에서 찾거나, 오늘 모인 친구들에게 맞는 게임을 찾아요.</p></header>
    <div className="personal-tabs" role="group" aria-label="게임 추천 방식">
      <button className={`btn ${kind === 'personal' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={kind === 'personal'} disabled={!!busy} onClick={() => model.setKind('personal')}>개인 게임 추천</button>
      <button className={`btn ${kind === 'group' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={kind === 'group'} disabled={!!busy} onClick={() => model.setKind('group')}>공통 게임 추천</button>
    </div>
    {busy === 'load' && <p role="status">취향과 멤버를 불러오는 중…</p>}
    {error && <div role="alert"><p>{error}</p>{!settings && <button className="btn btn-secondary" disabled={!!busy} onClick={model.load}>다시 불러오기</button>}</div>}
    {settings && <>
      <fieldset disabled={!!busy} className="personal-members"><legend>{kind === 'personal' ? '추천받을 내 Steam 계정' : `함께할 멤버 · ${selected.length}명`}</legend>
        {settings.members.filter(member => kind === 'group' || member.own).map(member => <label key={member.steamId}>
          <input type={kind === 'personal' ? 'radio' : 'checkbox'} name="personal-steam-account" checked={selected.includes(member.steamId)} disabled={!selected.includes(member.steamId) && selected.length >= 20}
            onChange={event => model.setSelected(kind === 'personal' ? [member.steamId] : event.target.checked ? [...selected, member.steamId] : selected.filter(id => id !== member.steamId))} />{member.name}{member.own ? ' (나)' : ''}
        </label>)}
        {!settings.members.some(member => member.own) && kind === 'personal' && <p className="personal-muted">내 계정으로 연결된 Steam 멤버가 없어요. 멤버 프로필에서 계정 연결을 확인해 주세요.</p>}
      </fieldset>
      <div className="personal-controls">
        <label>보유 범위<select className="text-input" disabled={!!busy} value={scope} onChange={event => model.setScope(event.target.value as typeof scope)}><option value="any">보유·새 게임 모두</option><option value="all">모두 보유한 게임</option><option value="new">한 명 이상 보유 목록에 없는 게임</option></select></label>
        {kind === 'personal' && <label><input type="checkbox" checked={solo} disabled={!!busy} onChange={event => model.setSolo(event.target.checked)} />혼자 할 수 있는 게임만</label>}
        <button className="btn btn-primary" disabled={!!busy || !valid} onClick={model.recommend}>{busy === 'recommend' ? '게임 찾는 중…' : kind === 'personal' ? '내 취향으로 추천받기' : `${selected.length}명에게 맞는 게임 찾기`}</button>
      </div>
      <p className="personal-muted">{kind === 'group' ? '선택 인원이 한 파티로 온라인 플레이 가능한 모드를 골라요. 친구의 취향은 공유 설정한 내용만 사용해요.' : '누적·최근 플레이 기록과 저장한 게임 취향을 참고해요. 플레이 시간은 선호를 확정하는 근거가 아니에요.'} 추천 계산에는 NVIDIA를 호출하지 않아요.</p>
      <details className="personal-preferences"><summary>내 게임 취향 설정{dirty ? ' · 저장하지 않은 변경' : ''}</summary>
        <p className="personal-muted">재순이 대화용 개인 메모와 별도로 저장해요. 저장한 내용만 추천에 반영하고, 새 대화·새로고침 뒤에도 유지돼요.</p>
        <fieldset disabled={!!busy}><legend>좋아하거나 피하는 장르·방식</legend><div className="personal-tag-grid">{settings.tags.map(tag => <label key={tag.id}>{tag.label}<select className="text-input" aria-label={`${tag.label} 취향`} value={taste.likes.includes(tag.id) ? 'like' : taste.avoids.includes(tag.id) ? 'avoid' : ''} onChange={event => setTag(tag.id, event.target.value)}><option value="">미설정</option><option value="like">좋아해요</option><option value="avoid">피하고 싶어요</option></select></label>)}</div></fieldset>
        <fieldset disabled={!!busy}><legend>게임별 선호 · 확인된 추천 카탈로그</legend><div className="personal-tag-grid">{settings.catalog.map(game => <label key={game.appId}>{game.name}<select className="text-input" aria-label={`${game.name} 선호`} value={taste.likedGames.includes(game.appId) ? 'like' : taste.avoidedGames.includes(game.appId) ? 'avoid' : ''} onChange={event => change({ likedGames: [...taste.likedGames.filter(id => id !== game.appId), ...(event.target.value === 'like' ? [game.appId] : [])], avoidedGames: [...taste.avoidedGames.filter(id => id !== game.appId), ...(event.target.value === 'avoid' ? [game.appId] : [])] })}><option value="">미설정</option><option value="like">좋아해요</option><option value="avoid">추천에서 제외</option></select></label>)}</div></fieldset>
        <label><input type="checkbox" checked={taste.share} disabled={!!busy} onChange={event => change({ share: event.target.checked })} />이 게임 취향과 직접 남긴 함께한 기록을 멤버들의 공통 추천에 사용하기</label>
        <p className="personal-muted">공유하지 않으면 본인의 추천에만 반영해요. 재순이 개인 메모·대화는 공유하지 않아요.</p>
        <h3 className="heading-4">직접 남기는 함께했던 게임</h3>
        <p className="personal-muted">Steam의 개인별 기록만으로 같은 세션에서 함께했는지 알 수 없어요. 공통 추천에서 본인과 함께했던 친구를 선택한 뒤 기록을 추가해 주세요. 날짜·동시 접속을 검증한 기록은 아니에요.</p>
        <div className="personal-controls"><label>함께했던 게임<select className="text-input" value={recordGame} disabled={!!busy} onChange={event => setRecordGame(event.target.value)}><option value="">게임 선택</option>{settings.catalog.map(game => <option key={game.appId} value={game.appId}>{game.name}</option>)}</select></label>
          <button className="btn btn-secondary" disabled={!!busy || kind !== 'group' || !ownSelected || selected.length < 2 || !recordGame || taste.together.length >= 10} onClick={() => { change({ together: [...taste.together, { appId: Number(recordGame), steamIds: [...selected] }] }); setRecordGame(''); }}>현재 선택 멤버와의 기록 추가</button></div>
        <ul className="personal-records">{taste.together.map((record, i) => <li key={`${record.appId}-${i}`}><span>{settings.catalog.find(game => game.appId === record.appId)?.name} · {record.steamIds.map(nameOf).join(', ')} · 사용자 입력</span><button className="btn btn-ghost" disabled={!!busy} onClick={() => change({ together: taste.together.filter((_, index) => index !== i) })}>기록 삭제</button></li>)}</ul>
        <div className="personal-controls"><button className="btn btn-primary" disabled={!!busy || !dirty} onClick={model.save}>{busy === 'save' ? '저장 중…' : '게임 취향 저장'}</button><button className="btn btn-secondary" disabled={!!busy} onClick={() => { if (confirm('게임 취향과 직접 남긴 함께한 기록을 모두 지울까요?')) void model.clear(); }}>게임 취향 전체 삭제</button></div>
      </details>
      {dirty && <p className="personal-muted" role="status">저장하지 않은 변경은 추천에 반영되지 않아요.</p>}
      {status && <p role="status">{status}</p>}
    </>}
    {result && <section aria-labelledby="personal-results"><h3 id="personal-results" className="heading-3">{result.kind === 'personal' ? '나를 위한 게임' : '오늘 함께할 게임'}</h3>
      <p className="personal-muted">{result.people}명 · 사용한 저장 취향 {result.sharedPreferences}명 · 특성을 확인한 플레이 게임 {result.sourceGames}개 · 추천 카탈로그 {result.catalogSize}개 · {new Date(result.capturedAt).toLocaleString('ko-KR')} 조회</p>
      {result.excluded.length > 0 ? <p role="status">보유 목록 확인 불가: {result.excluded.map(nameOf).join(', ')}. 일부 기록으로 전원 추천을 만들지 않았어요.</p> : <>
        {!!result.recentUnavailable.length && <p role="status" className="personal-muted">최근 기록 확인 불가: {result.recentUnavailable.map(nameOf).join(', ')}. 누적 기록과 저장 취향만 반영했어요.</p>}
        {result.metadataUnavailable > 0 && <p className="personal-muted">플레이한 게임 {result.metadataUnavailable}개의 장르 조회에 실패해 해당 유사성 근거를 제외했어요.</p>}
        <details className="personal-muted"><summary>추천 근거와 범위</summary><p>공식 설명에서 인원을 확인한 초기 카탈로그에서 찾아요. 전체 Steam 검색이 아니며 모드·인원은 아래 출처와 확인일을 참고해 주세요. 장르·게임 선호가 플레이 시간보다 우선하고, 공통 추천은 평균 선호와 가장 낮은 적합도를 함께 고려해요. 점수는 만족 확률이 아니에요. 모드 변경·모드 설치에 따른 인원 확장은 포함하지 않아요.</p>
          <ul>{result.groupExamples.map(example => <li key={example.appId}>{example.name} · {example.players}명 · {example.source === 'user-reported' ? '사용자가 함께했다고 남긴 기록' : '각자 플레이 경험 · 공동 세션 미확인'}</li>)}</ul></details>
        {!result.games.length && <p role="status">현재 카탈로그에서 인원·보유·제외 조건을 만족하는 후보가 없어요. 조건을 바꾸거나 기존 Steam 비교를 이용해 주세요.</p>}
        <ol className="personal-game-list">{result.games.map(game => <li key={game.appId}>
          <VisualImage src={`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appId}/header.jpg`} fallback={game.name} width={200} height={94} className="personal-cover" />
          <div><h4>{game.name}</h4><p>{game.modes.map(mode => `${mode.label} ${mode.min === mode.max ? mode.min : `${mode.min}~${mode.max}`}명`).join(' · ')}</p><p className="personal-muted">{game.score === null ? '개인화 근거 부족' : `추천 점수 ${game.score}`} · {game.tags.map(tag => settings?.tags.find(item => item.id === tag)?.label ?? tag).join(' · ')}</p>
            <ul>{game.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
            {game.missingIds.length > 0 && <p className="personal-muted">보유 목록에 없음: {game.missingIds.map(nameOf).join(', ')}. 무료 참여·패스·구매 조건은 스토어에서 확인해 주세요.</p>}{game.note && <p className="personal-muted">{game.note}</p>}
            <a href={game.source} target="_blank" rel="noopener noreferrer" className="btn btn-link">인원 근거 · Steam에서 확인</a><p className="personal-muted">확인일 {game.checkedAt}</p>
          </div>
        </li>)}</ol>
        {renderAnalysis?.(result)}
      </>}
    </section>}
    <Link href="/steam" className="btn btn-secondary">기존 보유 게임 비교·추천·도전으로</Link>
  </section>;
}
