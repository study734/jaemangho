'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameTaste } from './personalTypes';
import { createTasteModel } from './tasteModel';
import { SteamActivitySettings } from './ActivitySettings';

export function SteamTasteSettings({ linkResult }: { linkResult?: string }) {
  const [model] = useState(createTasteModel);
  const { settings, taste, saved, busy, error, status } = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getServerSnapshot);
  useEffect(() => { void model.load(); return () => model.cancel(); }, [model]);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const change = (patch: Partial<GameTaste>) => model.setTaste({ ...taste, ...patch });
  const setTag = (tag: string, value: string) => change({ likes: [...taste.likes.filter(item => item !== tag), ...(value === 'like' ? [tag] : [])], avoids: [...taste.avoids.filter(item => item !== tag), ...(value === 'avoid' ? [tag] : [])] });
  const dirty = JSON.stringify(taste) !== JSON.stringify(saved);
  const revoke = async () => {
    if (revoking || !confirm('Steam 공통 게임 이용 동의를 철회할까요? 기록 갱신과 취향 반영을 중단하고, 다시 동의하기 전에는 기능을 사용할 수 없어요.')) return;
    setRevoking(true); setRevokeError('');
    try {
      const response = await fetch('/api/steam/consent', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch { setRevokeError('동의를 철회하지 못했어요. 다시 시도해 주세요.'); setRevoking(false); }
  };
  return <details id="game-taste" className="steam-data-settings" open={!!linkResult}>
    <summary>내 추천 데이터·취향 설정</summary>
    <p className="personal-muted">개인의 기록과 취향은 함께할 게임을 찾는 데이터로 사용해요.</p>
    <SteamActivitySettings linkResult={linkResult} />
    {busy === 'load' && <p role="status">취향 데이터를 불러오는 중…</p>}
    {error && <div role="alert"><p>{error}</p>{!settings && <button className="btn btn-secondary" onClick={model.load}>다시 불러오기</button>}</div>}
    {settings && <>
      <p className="personal-muted">내 연결 계정: {settings.members.filter(member => member.own).map(member => member.name).join(', ') || '아직 없어요. Steam 계정 확인 또는 멤버 프로필에서 연결해 주세요.'}</p>
      <details className="personal-preferences"><summary>공통 추천에 쓸 내 취향{dirty ? ' · 저장하지 않은 변경' : ''}</summary>
        <p className="personal-muted">함께할 멤버에 내가 포함되면 저장한 취향을 공통 협동 게임 추천에 반영해요. 솔로 게임 선호도 비슷한 장르·방식의 협동 게임을 찾는 참고 자료로 사용해요.</p>
        <fieldset disabled={!!busy}><legend>좋아하거나 피하는 장르·방식</legend><div className="personal-tag-grid">{settings.tags.map(tag => <label key={tag.id}>{tag.label}<select className="text-input" aria-label={`${tag.label} 취향`} value={taste.likes.includes(tag.id) ? 'like' : taste.avoids.includes(tag.id) ? 'avoid' : ''} onChange={event => setTag(tag.id, event.target.value)}><option value="">미설정</option><option value="like">좋아해요</option><option value="avoid">피하고 싶어요</option></select></label>)}</div></fieldset>
        <fieldset disabled={!!busy}><legend>게임별 선호 · 취향 참고 게임</legend><div className="personal-tag-grid">{settings.catalog.map(game => <label key={game.appId}>{game.name}<select className="text-input" aria-label={`${game.name} 선호`} value={taste.likedGames.includes(game.appId) ? 'like' : taste.avoidedGames.includes(game.appId) ? 'avoid' : ''} onChange={event => change({ likedGames: [...taste.likedGames.filter(id => id !== game.appId), ...(event.target.value === 'like' ? [game.appId] : [])], avoidedGames: [...taste.avoidedGames.filter(id => id !== game.appId), ...(event.target.value === 'avoid' ? [game.appId] : [])] })}><option value="">미설정</option><option value="like">좋아해요</option><option value="avoid">추천에서 제외</option></select></label>)}</div></fieldset>
        <div className="personal-controls"><button className="btn btn-primary" disabled={!!busy || !dirty} onClick={model.save}>{busy === 'save' ? '저장 중…' : '게임 취향 저장'}</button><button className="btn btn-secondary" disabled={!!busy} onClick={() => { if (confirm('게임 취향을 모두 지울까요?')) void model.clear(); }}>게임 취향 전체 삭제</button></div>
      </details>

      {dirty && <p role="status" className="personal-muted">저장하지 않은 변경은 공통 추천에 반영되지 않아요.</p>}
      {status && <p role="status">{status}</p>}
    </>}
    {revokeError && <p role="alert">{revokeError}</p>}
    <button className="btn btn-ghost" disabled={revoking || !!busy} onClick={() => void revoke()}>Steam 기능 동의 철회</button>
  </details>;
}
