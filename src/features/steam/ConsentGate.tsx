'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// 고지 문구는 서버 한 곳(src/lib/steam-notice.ts)에 있고 GET /api/steam/consent가 함께 돌려준다(디스코드 동의와 같은 문구).
export interface SteamNotice { title: string; intro: string; items: { term: string; text: string }[]; countryTerm: string }
interface Consent { accepted: boolean; noticeVersion: string; storageCountry: string | null; notice: SteamNotice }

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
    <h2 id="steam-consent-title" className="heading-3" tabIndex={-1}>{consent?.notice.title ?? 'Steam 공통 게임 이용 동의'}</h2>
    {consent && <><p>{consent.notice.intro}</p><SteamNoticeList notice={consent.notice} storageCountry={consent.storageCountry} /></>}
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

// 고지 항목 목록. 동의 창과 /connect/steam이 같은 모양으로 쓴다.
export function SteamNoticeList({ notice, storageCountry }: { notice: SteamNotice; storageCountry: string | null }) {
  return <dl>
    {notice.items.map(item => <div key={item.term}><dt>{item.term}</dt><dd>{item.text}</dd></div>)}
    <div><dt>{notice.countryTerm}</dt><dd>{storageCountry ?? '정해지지 않음'}</dd></div>
  </dl>;
}
