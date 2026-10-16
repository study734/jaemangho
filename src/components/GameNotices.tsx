'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { Notice } from '@/lib/game-notice';

const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const when = (n: Notice) => n.startsAt ? `${fmt.format(new Date(n.startsAt))}${n.endsAt ? ` ~ ${fmt.format(new Date(n.endsAt))}` : ''}` : n.endsAt ? `${fmt.format(new Date(n.endsAt))}까지` : '기한 없음';

export function GameNotices({ notices, viewerId, isAdmin }: { notices: Notice[] | null; viewerId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<'event' | 'code'>('event');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const iso = (key: string) => { const v = String(f.get(key) ?? ''); return v ? new Date(v).toISOString() : undefined; };
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/notices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, game: f.get('game'), title: f.get('title'), code: kind === 'code' ? f.get('code') : undefined, startsAt: iso('startsAt'), endsAt: iso('endsAt') }),
      });
      if (!res.ok) { setError(res.status === 400 ? '입력 내용을 확인해 주세요.' : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
      form.reset(); router.refresh();
    } catch { setError('연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setError('');
    const res = await fetch(`/api/notices/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res && (res.ok || res.status === 404)) router.refresh(); else setError('삭제하지 못했어요.');
  }

  const section = (title: string, items: Notice[]) => (
    <section className="notice-section">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="notice-empty">아직 없어요.</p> : (
        <ul className="friends-list">
          {items.map(n => (
            <li key={n.id} className="notice-row">
              <div className="notice-main">
                <b>{n.game} · {n.title}</b>
                {n.code && <code className="notice-code">{n.code}</code>}
                <small>{when(n)} · {n.userName}</small>
              </div>
              {(n.userId === viewerId || isAdmin) && <button type="button" className="btn-ghost" onClick={() => remove(n.id)}>삭제</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="activity-hub">
      <header className="hub-heading">
        <p className="home-eyebrow">일정 · 코드</p>
        <h1>우리 게임 일정과 리딤코드</h1>
        <p>멤버가 올린 이벤트와 코드예요. 기한이 지나면 자동으로 사라져요.</p>
      </header>
      {notices === null
        ? <p role="alert" className="notice-error">목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>
        : <>{section('일정', notices.filter(n => n.kind === 'event'))}{section('리딤코드', notices.filter(n => n.kind === 'code'))}</>}
      <form className="notice-form" onSubmit={submit} aria-label="일정·코드 올리기">
        <div role="radiogroup" aria-label="종류" className="notice-kinds">
          {(['event', 'code'] as const).map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'pill-tab pill-tab-active' : 'pill-tab'} onClick={() => setKind(k)}>{k === 'event' ? '일정' : '리딤코드'}</button>
          ))}
        </div>
        <input name="game" className="text-input" placeholder="게임 이름" maxLength={40} required aria-label="게임 이름" />
        <input name="title" className="text-input" placeholder={kind === 'event' ? '이벤트 이름' : '코드 설명 (예: 출시 기념 보상)'} maxLength={100} required aria-label="제목" />
        {kind === 'code' && <input name="code" className="text-input" placeholder="코드" maxLength={80} required aria-label="코드" />}
        <label>{kind === 'event' ? '시작' : '시작 (선택)'}<input name="startsAt" type="datetime-local" className="text-input" required={kind === 'event'} /></label>
        <label>{kind === 'event' ? '종료 (선택, 없으면 시작 다음 날)' : '만료 (선택, 없으면 직접 삭제)'}<input name="endsAt" type="datetime-local" className="text-input" /></label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
        {error && <p role="alert" className="notice-error">{error}</p>}
      </form>
    </div>
  );
}
