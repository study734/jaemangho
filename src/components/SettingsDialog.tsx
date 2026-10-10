'use client';

import Link from 'next/link';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { UiIcon } from './VisualImage';

export function SettingsDialog({ userName, isAdmin, children, onClose }: {
  userName: string;
  isAdmin: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const [section, setSection] = useState<'account' | 'riot'>('account');
  const showDialog = useCallback((node: HTMLDialogElement | null) => {
    if (node && !node.open) {
      node.showModal();
      node.querySelector<HTMLButtonElement>('.settings-dialog-close')?.focus();
    }
  }, []);

  return <dialog ref={showDialog} className="settings-dialog" aria-labelledby={titleId} onClose={onClose} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(element => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }} onClick={event => {
    const box = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) event.currentTarget.close();
  }}>
    <aside className="settings-dialog-sidebar">
      <div className="settings-profile">
        <span className="channel-user-avatar" aria-hidden="true">{userName.slice(0, 1)}</span>
        <div><b>{userName}</b><span>사용자 설정</span></div>
      </div>
      <nav aria-label="설정 메뉴">
        <button type="button" className="settings-menu-item" aria-current={section === 'account' ? 'page' : undefined} onClick={() => setSection('account')}><UiIcon name="people" />계정 정보</button>
        <button type="button" className="settings-menu-item" aria-current={section === 'riot' ? 'page' : undefined} onClick={() => setSection('riot')}><UiIcon name="gear" />Riot 연결</button>
        {isAdmin && <Link href="/admin" className="settings-menu-item" onClick={onClose}><UiIcon name="gear" />관리자 화면</Link>}
      </nav>
    </aside>
    <div className="settings-dialog-main">
      <header className="settings-dialog-header">
        <h2 id={titleId}>사용자 설정</h2>
        <button type="button" className="btn btn-ghost settings-dialog-close" aria-label="설정 닫기" onClick={event => event.currentTarget.closest('dialog')?.close()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="settings-dialog-content">
        {section === 'account' ? <section className="settings-account" aria-labelledby="settings-account-title">
          <h3 id="settings-account-title">계정 정보</h3>
          <p>디스코드로 로그인한 재망호 계정이에요.</p>
          <dl><div><dt>이름</dt><dd>{userName}</dd></div><div><dt>역할</dt><dd>{isAdmin ? '관리자' : '크루원'}</dd></div><div><dt>로그인 방식</dt><dd>디스코드</dd></div></dl>
        </section> : children}
      </div>
    </div>
  </dialog>;
}
