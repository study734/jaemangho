'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SteamNoticeList, type SteamNotice } from './ConsentGate';

// 디스코드 게임추천 준비 화면의 본문(intent/0005). 상태는 서버(steamSetupStatus)가 계산하고, 여기서는 단계 표시와
// 동의 저장(기존 POST /api/steam/consent)·다시 확인(router.refresh)만 한다.
interface Status { accounts: { steamId: string; name: string }[]; consented: boolean; storageCountry: string | null }
const LINK_RESULT: Record<string, string> = {
  verified: 'Steam 본인 확인을 마쳤어요.',
  'already-linked': '이 Steam 계정은 이미 다른 멤버에게 확인돼 있어요. 관리자에게 알려 주세요.',
  failed: 'Steam 본인 확인을 마치지 못했어요. 다시 시도해 주세요.',
};

export function ConnectSteam({ status, notice, noticeVersion, linkResult, discordUrl }:
  { status: Status; notice: SteamNotice; noticeVersion: string; linkResult?: string; discordUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const linked = status.accounts.length > 0;
  const done = linked && status.consented;

  // 로그인 직후에는 디스코드에 연결해 둔 Steam이 응답 뒤에 이어지므로, 아직 없으면 한 번만 다시 확인한다.
  const retried = useRef(false);
  useEffect(() => {
    if (linked || retried.current) return;
    retried.current = true;
    const timer = setTimeout(() => router.refresh(), 3000);
    return () => clearTimeout(timer);
  }, [linked, router]);

  const accept = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/steam/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, noticeVersion }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch { setError('동의를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  };

  return <>
    <p className="subtitle">{done ? '준비가 끝났어요. 디스코드로 돌아가서 /게임추천을 다시 실행해 주세요.' : '두 단계만 남았어요. 끝나면 디스코드에서 바로 게임추천을 쓸 수 있어요.'}</p>
    {/* 본인 확인 결과는 아직 끝나지 않았을 때만 보인다(다 끝났는데 지난 실패가 남지 않게). */}
    {!done && linkResult && LINK_RESULT[linkResult] && <p role="status" className="connect-note">{LINK_RESULT[linkResult]}</p>}
    <ol className="connect-steps">
      <li className="is-done"><b>디스코드로 로그인</b><span>완료</span></li>
      <li className={linked ? 'is-done' : ''} aria-current={linked ? undefined : 'step'}>
        <b>Steam 연결</b>
        {linked
          ? <span>{status.accounts.map(account => account.name).join(', ')}</span>
          : <>
            <span>디스코드에 Steam을 연결해 뒀다면 곧 자동으로 이어져요. 아니면 Steam에서 본인 확인을 해 주세요.</span>
            <span className="connect-actions">
              <a className="btn btn-primary" href="/api/steam/activity/start?from=connect">Steam으로 본인 확인</a>
              <button type="button" className="btn btn-secondary" onClick={() => router.refresh()}>다시 확인</button>
            </span>
          </>}
      </li>
      <li className={status.consented ? 'is-done' : ''} aria-current={linked && !status.consented ? 'step' : undefined}>
        <b>이용 동의</b>
        {status.consented
          ? <span>완료</span>
          : <>
            <span>{notice.intro}</span>
            <div className="connect-notice"><SteamNoticeList notice={notice} storageCountry={status.storageCountry} /></div>
            <Link href="/privacy/steam" target="_blank" className="btn btn-link">Steam 데이터 안내 자세히 보기</Link>
            {error && <span role="alert" className="connect-note">{error}</span>}
            <span className="connect-actions">
              <button type="button" className="btn btn-primary" disabled={busy || !status.storageCountry} onClick={() => void accept()}>
                {busy ? '동의 저장 중…' : '동의하기'}
              </button>
            </span>
          </>}
      </li>
      <li className={done ? 'is-done' : ''} aria-current={done ? 'step' : undefined}>
        <b>디스코드로 돌아가기</b>
        <span>{done ? '/게임추천을 다시 실행하면 바로 친구를 고를 수 있어요.' : '위 단계를 마치면 열려요.'}</span>
        {done && discordUrl && <span className="connect-actions"><a className="btn btn-primary" href={discordUrl}>디스코드 열기</a></span>}
      </li>
    </ol>
  </>;
}
