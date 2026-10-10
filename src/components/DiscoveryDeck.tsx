'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { UiIcon, VisualImage } from './VisualImage';
import type { DiscoveryCard, DiscoveryFeed } from '@/lib/discovery';
import { JaesuniAuthor, JaesuniMessage } from './JaesuniMessage';

const dateLabel = (card: DiscoveryCard) => card.at ? new Date(card.at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }) + (card.kind === 'award' ? ' 시작한 주' : '') : '오늘 같이 놀기';

function hostLine(card: DiscoveryCard, revealed: boolean) {
  switch (card.kind) {
    case 'award': return revealed ? '이번 주 이 칭호는 이 사람 거야.' : '이번 주 칭호, 누구 거일까.';
    case 'highlight': return revealed ? '반응이 몰린 한마디야. 원문은 아래에서.' : '반응이 몰린 한마디가 있었어.';
    case 'moment': return revealed ? '이 10분을 만든 사람들이야.' : '평소보다 시끄러웠던 10분이 있었어.';
    case 'play': return revealed ? '멤버부터 골라. 같이 가진 게임에서 뽑아줄게.' : '오늘 뭐 할지 아직이라면.';
  }
}

function People({ card, compact = false, sealed = false }: { card: DiscoveryCard; compact?: boolean; sealed?: boolean }) {
  const size = compact ? 48 : card.people.length === 1 ? 168 : 76;
  return <div className={`discovery-people ${compact ? 'is-compact' : card.people.length === 1 ? 'is-protagonist' : ''} ${sealed ? 'is-sealed' : ''}`} aria-hidden={sealed || undefined}>
    {card.people.slice(0, compact ? 1 : 3).map((p, i) => <div key={`${p.userId ?? p.name}:${i}`}>
      <VisualImage src={p.image} fallback={p.name.slice(0, 1)} width={size} height={size} className="discovery-avatar" />
      {!sealed && <span>{p.name}</span>}
    </div>)}
    {!sealed && card.people.length > (compact ? 1 : 3) && <span>외 {card.people.length - (compact ? 1 : 3)}명</span>}
  </div>;
}

function ContentVisual({ card, revealed }: { card: DiscoveryCard; revealed: boolean }) {
  return <div className={`discovery-art discovery-art-${card.kind} ${revealed ? 'is-revealed' : ''}`}>
    {card.kind === 'play' ? <div className="discovery-play-covers">{[{ id: 413150, name: 'Stardew Valley' }, { id: 1966720, name: 'Lethal Company' }, { id: 105600, name: 'Terraria' }].map(game => <VisualImage key={game.id} src={`/images/games/${game.id}.jpg`} alt={`${game.name} · 편집자의 제안`} fallback={game.name} width={184} height={86} />)}</div> : card.people.length ? <People card={card} sealed={!revealed} /> : null}
    {(revealed || card.kind === 'award' || card.kind === 'play') && <strong className="discovery-prize">{revealed || card.kind === 'award' ? card.metric : '오늘의 크루픽'}</strong>}
    <span className="discovery-art-caption">{revealed ? card.context : card.kind === 'award' ? '칭호의 주인공을 공개해봐' : card.kind === 'play' ? '그림은 편집자의 제안 · 보유 여부는 멤버 선택 후 확인' : '기록 속 주인공을 확인해봐'}</span>
    {revealed && card.comparison && <div className="discovery-comparison" role="img" aria-label={`평소 중앙값 ${card.comparison.usual}개, 이 순간 ${card.comparison.current}개`}>
      <div><span>평소</span><i style={{ width: `${100 * card.comparison.usual / card.comparison.current}%` }} /><b>{card.comparison.usual}</b></div>
      <div><span>이 순간</span><i style={{ width: '100%' }} /><b>{card.comparison.current}</b></div>
    </div>}
  </div>;
}

function DiscoveryActions({ card, revealed }: { card: DiscoveryCard; revealed: boolean }) {
  const [reaction, setReaction] = useState<{ count: number; reacted: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [manualShare, setManualShare] = useState('');
  const [reactionError, setReactionError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/discovery/reaction?cardId=${encodeURIComponent(card.id)}`, { signal: abort.signal }).then(async r => {
      if (!r.ok) throw new Error('reaction');
      return r.json();
    }).then(setReaction).catch(() => { if (!abort.signal.aborted) setReactionError(true); });
    return () => abort.abort();
  }, [card.id]);

  async function react() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/discovery/reaction', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId: card.id, reacted: !reaction?.reacted }) });
      if (!response.ok) throw new Error('reaction');
      setReaction(await response.json());
      setReactionError(false);
    } catch { setNotice('반응을 저장하지 못했어요. 다시 눌러 주세요.'); }
    finally { setBusy(false); }
  }

  async function share() {
    setManualShare('');
    const url = new URL('/', window.location.origin);
    url.searchParams.set('discovery', card.id);
    const data = { title: `재망호 발견 · ${card.title}`, text: revealed ? card.result : '이번 발견의 결과를 확인해봐.', url: url.href };
    try {
      if (navigator.share) { await navigator.share(data); setNotice('공유했어요.'); }
      else { await navigator.clipboard.writeText(`${data.title}\n${data.text}\n${data.url}`); setNotice('공유할 내용과 링크를 복사했어요. 로그인한 친구가 열 수 있어요.'); }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice('자동 공유를 사용할 수 없어요. 아래 링크를 복사해 주세요.');
      setManualShare(url.href);
    }
  }

  return <>
    <div className="discovery-rail">
      <button className="discovery-rail-btn" aria-pressed={reaction?.reacted ?? false} disabled={busy || (!reaction && !reactionError)} onClick={react}>
        <i className="discovery-rail-ico"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill={reaction?.reacted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 20.5C6 16.5 3 13 3 9.5 3 7 5 5 7.5 5c1.7 0 3.4.9 4.5 2.4C13.1 5.9 14.8 5 16.5 5 19 5 21 7 21 9.5c0 3.5-3 7-9 11z" /></svg></i>
        <span>{reaction?.reacted ? '재밌어요' : '재밌다'}{reaction ? ` ${reaction.count}` : ''}</span>
      </button>
      <button className="discovery-rail-btn" aria-label="친구에게 공유" onClick={share}><i className="discovery-rail-ico"><UiIcon name="box-arrow-up-right" size={22} /></i><span>공유</span></button>
    </div>
    <div className="discovery-notes">
      {reactionError && <p role="status">반응을 불러오지 못했어요. 눌러서 다시 저장할 수 있어요.</p>}
      {notice && <p role="status">{notice}</p>}
      {manualShare && <input aria-label="공유할 발견 링크" value={manualShare} readOnly onFocus={e => e.target.select()} />}
    </div>
  </>;
}

export function DiscoveryDeck({ cards, unavailable, selectedId }: DiscoveryFeed & { selectedId?: string }) {
  const [index, setIndex] = useState(() => Math.max(0, cards.findIndex(c => c.id === selectedId)));
  const [revealed, setRevealed] = useState<string[]>([]);
  const [imageFailed, setImageFailed] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const resultId = useId();
  const currentIndex = Math.min(index, cards.length - 1);
  const card = cards[currentIndex];
  if (!card) return null;
  const go = (to: number) => setIndex(Math.max(0, Math.min(cards.length - 1, to)));
  const isRevealed = revealed.includes(card.id);
  const hasRecords = cards.some(c => c.kind !== 'play');
  const headline = isRevealed ? card.kind === 'award' ? card.people.length === 1 ? card.title : `이번 칭호, ${card.people.length}명이 함께` : card.kind === 'moment' ? `${card.metric}의 이야기가 오간 10분` : card.kind === 'highlight' ? `${card.people[0]?.name ?? '친구'}님의 한마디` : '같이 가진 게임부터 골라보자' : hasRecords ? card.kind === 'highlight' ? '반응과 답글을 모은 사람은?' : card.title : '아직 꺼내볼 기록이 없어';
  return <section className={`discovery-deck ${isRevealed ? 'is-revealed' : ''} ${!hasRecords ? 'is-empty' : ''}`} aria-labelledby="discovery-title"
    onKeyDown={e => { if ((e.target as HTMLElement).closest('input,textarea')) return; if (e.key === 'ArrowRight') go(currentIndex + 1); if (e.key === 'ArrowLeft') go(currentIndex - 1); }}>
    <h1 id="discovery-title" className="sr-only">오늘은 무슨 일이 있었을까?</h1>
    {unavailable ? <p role="status" className="discovery-notice">일부 기록을 불러오지 못했어요. 확인된 기록과 게임 찾기를 보여드릴게요.</p> : !hasRecords && <p className="discovery-notice">아직 소개할 만한 기록이 없어요. 오늘은 같이 할 게임부터 골라볼까요?</p>}
    {selectedId && !cards.some(c => c.id === selectedId) && <p role="status" className="discovery-notice">공유된 발견이 현재 목록에 없어요. 최근 선별된 기록을 보여드릴게요.</p>}
    <article className="dc-message">
      {!imageFailed ? <Image ref={node => { if (node?.complete && node.naturalWidth === 0) setImageFailed(true); }} src="/images/jaesuni-home.webp" alt="게임패드를 든 재망호 막내 재순이" width={1942} height={809} className="discovery-mascot dc-avatar" sizes="40px" priority onError={() => setImageFailed(true)} /> : <span className="dc-avatar dc-avatar-text" aria-hidden="true">재</span>}
      <div className="dc-body">
        <div className="discovery-dialogue" aria-live="polite"><JaesuniAuthor className="home-eyebrow" /><p className="dc-text">{hostLine(card, isRevealed)}</p></div>
        <div className={`dc-embed discovery-stage-${card.kind}`}
          onPointerDown={e => { swipe.current = (e.target as HTMLElement).closest('button,a,input,summary') ? null : { x: e.clientX, y: e.clientY }; }}
          onPointerCancel={() => { swipe.current = null; }}
          onPointerUp={e => { const s = swipe.current; swipe.current = null; if (!s) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(currentIndex + (dx < 0 ? 1 : -1)); }}>
          <div className="dc-embed-body" key={card.id}>
            <div className="discovery-meta"><span>{card.label}</span>{card.at && <time dateTime={card.at}>{dateLabel(card)}</time>}</div>
            <h2 className="dc-embed-title" aria-live="polite" aria-atomic="true">{headline}</h2>
            {hasRecords && <ContentVisual card={card} revealed={isRevealed} />}
            <div id={resultId} className="discovery-result" hidden={!isRevealed}><p>{card.result}</p>{!hasRecords && <span className="discovery-art-caption">{card.context}</span>}{card.href.startsWith('https://') ? <a href={card.href} className="btn btn-link" target="_blank" rel="noopener noreferrer">{card.action} ↗</a> : <Link href={card.href} className="btn btn-link">{card.action} →</Link>}</div>
          </div>
          {cards.length > 1 && <ol className="discovery-progress" aria-label="발견 목록">
            {cards.map((c, i) => <li key={c.id}><button aria-label={`${i + 1}번째 발견`} aria-current={i === currentIndex || undefined} className={i <= currentIndex ? 'is-passed' : ''} onClick={() => go(i)} /></li>)}
          </ol>}
        </div>
        <div className="dc-components">
          <button className={`btn ${isRevealed ? 'btn-secondary' : 'btn-primary'}`} aria-expanded={isRevealed} aria-controls={resultId} onClick={() => setRevealed(previous => previous.includes(card.id) ? previous.filter(id => id !== card.id) : [...previous, card.id])}>{isRevealed ? '결과 접기' : card.kind === 'play' ? '게임 뽑기 알아보기' : '결과 공개'}</button>
          {cards.length > 1 && <>
            <button className="btn btn-secondary" aria-label="이전 발견" disabled={currentIndex === 0} onClick={() => go(currentIndex - 1)}>← 이전</button>
            <button className={`btn ${isRevealed && currentIndex < cards.length - 1 ? 'btn-primary' : 'btn-secondary'}`} aria-label="다음 발견" disabled={currentIndex === cards.length - 1} onClick={() => go(currentIndex + 1)}>{currentIndex === cards.length - 1 ? '여기까지 봤어' : isRevealed ? '다음 발견 →' : '다음 →'}</button>
            <span role="status" className="dc-status">{currentIndex + 1} / {cards.length}{currentIndex === cards.length - 1 && ' · 오늘의 발견 끝'}</span>
          </>}
        </div>
        {isRevealed && <DiscoveryActions key={`actions:${card.id}`} card={card} revealed={isRevealed} />}
        {hasRecords && <details className="discovery-provenance"><summary>왜 이 기록을 골랐을까?</summary><p>{card.reason}</p><p>{card.source} · 로그인한 재망호 멤버에게 표시</p></details>}
      </div>
    </article>
  </section>;
}

export function DiscoveryWeek({ cards, unavailable }: DiscoveryFeed) {
  const records = cards.filter(c => c.kind !== 'play');
  const featured = ['award', 'highlight', 'moment'].flatMap(kind => records.find(c => c.kind === kind) ?? []).slice(0, 3);
  if (!featured.length && !unavailable) return null;
  return <JaesuniMessage className="home-week" line="요즘 우리 기록을 모아봤어. 각 기록을 누르면 해당 발견으로 이어져."><section aria-labelledby="memories-title">
    <div className="home-section-heading"><h2 id="memories-title">요즘 우리</h2><Link href="/memories" className="btn btn-link">우리 기록 보기 →</Link></div>
    {featured.length ? <ol className="feed">{featured.map(card => {
      const who = card.people[0];
      return <li key={card.id}><Link href={`/?discovery=${encodeURIComponent(card.id)}`} className={`msg-row home-record-${card.kind}`}>
        <VisualImage src={who?.image} fallback={(who?.name ?? '재').slice(0, 1)} width={40} height={40} className="msg-avatar" />
        <div className="msg-body">
          <p className="msg-head"><b>{who?.name ?? '재망호'}</b><time dateTime={card.at ?? undefined}>{dateLabel(card)}</time></p>
          <p className="msg-text">{card.label} · {card.kind === 'award' ? card.metric : card.title}</p>
          <p className="msg-text">{card.result}</p>
        </div>
      </Link></li>;
    })}</ol> : <p className="home-records-empty">{unavailable ? '기록을 확인하고 있어요. 확인되지 않은 장면은 소개하지 않아요.' : '소개할 만한 장면이 아직 없어요. 새 기록이 모이면 여기서 만나요.'}</p>}
  </section></JaesuniMessage>;
}
