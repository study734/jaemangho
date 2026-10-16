'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Consent { accepted: boolean; noticeVersion: string; storageCountry: string | null }

export function SteamConsentGate({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const showDialog = useCallback((node: HTMLDialogElement | null) => {
    if (node && !node.open) {
      node.showModal();
      node.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      node.scrollTop = 0;
    }
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/steam/consent', { cache: 'no-store', signal });
      if (!response.ok) throw new Error();
      const body = await response.json() as Consent;
      if (!signal?.aborted) { setConsent(body); setError(''); }
    } catch { if (!signal?.aborted) setError('이용 동의를 확인하지 못했어요. 다시 확인해 주세요.'); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  const accept = async () => {
    if (pending.current || !consent) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/steam/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, noticeVersion: consent.noticeVersion }) });
      if (!response.ok) throw new Error();
      setConsent({ ...consent, accepted: true });
    } catch { setError('동의를 저장하지 못했어요. 기능을 열지 않았습니다. 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  };

  if (consent?.accepted) return children;
  return <dialog ref={showDialog} className="steam-consent-dialog" aria-labelledby="steam-consent-title" onCancel={event => event.preventDefault()}>
    <h2 id="steam-consent-title" className="heading-3" tabIndex={-1}>Steam 공통 게임 이용 동의</h2>
    <p>함께할 멤버 모두에게 맞는 협동 게임을 추천하기 위해 Steam 기록과 취향을 사용해요. 아래 내용에 동의해야 이 기능을 사용할 수 있어요.</p>
    <dl>
      <div><dt>사용하는 데이터</dt><dd>공개 보유 게임·누적 및 최근 플레이 기록, 내가 저장한 좋아함·피함 취향, 동의 후 관측한 플레이 시간 증가분을 공통 추천에 반영해요. 취향 원문은 다른 멤버에게 표시하지 않아요.</dd></div>
      <div><dt>미리 기록 준비</dt><dd>Steam에서 본인 확인을 마친 내 계정만 첫 기준 기록을 준비해요. 이후 방문 시 7일 이상 지난 기록을 갱신해요. 방문하지 않는 동안 예약 수집은 하지 않아요.</dd></div>
      <div><dt>보관과 통제</dt><dd>기록은 직접 삭제할 때까지 보관해요. 추천 데이터 설정에서 수집을 중단하거나 기록·취향을 삭제하고 이용 동의를 철회할 수 있어요. 실제 플레이 시각이나 실력·만족도를 추측하지 않아요.</dd></div>
      <div><dt>저장 국가</dt><dd>{consent?.storageCountry ?? '확인 중…'}</dd></div>
    </dl>
    <Link href="/privacy/steam" target="_blank" className="btn btn-link">Steam 데이터 안내 자세히 보기</Link>
    {error && <p role="alert">{error}</p>}
    {!consent && !error && <p role="status">동의 상태를 확인하는 중…</p>}
    <div className="steam-consent-actions">
      <button className="btn btn-primary" disabled={busy || !consent?.storageCountry} onClick={() => void accept()}>{busy ? '동의 저장 중…' : '동의하고 Steam 공통 게임 사용'}</button>
      {error && !consent && <button className="btn btn-secondary" onClick={() => void load()}>다시 확인</button>}
      <Link href="/play" className="btn btn-secondary">동의하지 않고 나가기</Link>
    </div>
  </dialog>;
}
