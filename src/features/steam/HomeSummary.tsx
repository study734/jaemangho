'use client';

import { useEffect, useState } from 'react';
import { steamApi, type SteamMember } from './api';
import { VisualImage } from './VisualImage';

// 홈 카드 안에 들어가는 Steam 요약. 실패해도 홈 전체는 그대로 보인다.
export function SteamHomeSummary() {
  const [count, setCount] = useState<number | null>(null);
  const [members, setMembers] = useState<SteamMember[]>([]);
  const [needsConsent, setNeedsConsent] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/steam/consent', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const consent = await response.json();
        if (!consent.accepted) { setNeedsConsent(true); return; }
        const list = await steamApi.list();
        if (!controller.signal.aborted) { setCount(list.length); setMembers(list); }
      } catch { /* Summary failures leave the home usable; no data is inferred. */ }
    })();
    return () => controller.abort();
  }, []);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>등록된 사람</span>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{needsConsent ? '동의 후 확인' : count === null ? '-' : `${count}명`}</span>
      </div>
      {members.length > 0 && <div className="steam-avatar-strip">{members.slice(0, 6).map((m) => <span key={m.steamId} title={m.name}><VisualImage src={m.avatar} fallback={m.name.slice(0, 1)} width={32} height={32} className="member-avatar" /></span>)}</div>}
    </>
  );
}
