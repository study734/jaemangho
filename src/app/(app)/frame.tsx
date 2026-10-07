'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { summarizeRoster, useLol } from '@/features/lol';
import { Sidebar } from '@/components/Sidebar';
import { sectionOf } from '@/components/nav';
import { TopBar } from '@/components/TopBar';
import { UiIcon } from '@/components/VisualImage';

// 앱 틀: 사이드바 + 상단 안내(로딩/오류/동기화) + 현재 화면
export function Frame({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const { members, isLoading: lolLoading, error, dismissError, refreshAll } = useLol();
  // 로딩 배너와 동기화 버튼은 롤 데이터용이라 롤 화면에서만 보인다
  const pathname = usePathname();
  // 화면이 열릴 때 한 번 센다(누가 열었는지는 저장하지 않는다). 실패해도 화면에는 영향이 없다.
  const lastTracked = useRef<string | null>(null);
  useEffect(() => {
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: pathname }), keepalive: true }).catch(() => {});
  }, [pathname]);
  const onLol = pathname.startsWith('/lol');
  const isLoading = onLol && lolLoading;

  return (
    <div className="app-frame" style={styles.appContainer}>
      <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
      <TopBar isAdmin={isAdmin} />
      <div className="app-body" style={styles.body}>
      {sectionOf(pathname) !== 'home' && <Sidebar summary={summarizeRoster(members)} isAdmin={isAdmin} />}

      <main id="main-content" tabIndex={-1} style={styles.mainPane}>
        {isLoading && (
          <div role="status" style={styles.loadingBanner}>
            <span className="pulse-indicator" style={{ marginRight: '8px' }} />
            라이엇 서버로부터 소환사들의 최신 전적을 받아오고 있습니다...
          </div>
        )}

        {onLol && error && (
          <div role="alert" style={styles.errorBanner}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
              <UiIcon name="exclamation-triangle" />
              <span>{error}</span>
            </div>
            <button className="btn" style={styles.errorCloseBtn} aria-label="오류 안내 닫기" onClick={dismissError}>
              닫기
            </button>
          </div>
        )}

        {onLol && !lolLoading && (
          <div style={styles.syncRow}>
            <button className="btn btn-secondary" style={styles.syncBtn} onClick={() => refreshAll()}>
              <UiIcon name="arrow-repeat" />
              롤 정보 다시 불러오기
            </button>
          </div>
        )}

        {children}
      </main>
      </div>
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  appContainer: { display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' },
  body: { display: 'flex', flexGrow: 1, minHeight: 0, minWidth: 0 },
  mainPane: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--canvas-dark)',
    position: 'relative',
    overflow: 'hidden',
  },
  loadingBanner: {
    backgroundColor: 'var(--accent-pink)',
    color: 'var(--canvas-dark)',
    padding: '8px 24px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  syncRow: { padding: '16px var(--page-padding) 0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 },
  syncBtn: { fontSize: '12.5px', padding: '6px 14px' },
  errorBanner: {
    backgroundColor: '#fff8e0',
    color: '#946f3f',
    padding: '12px 24px',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1.5px solid #fa6e39',
    zIndex: 5,
  },
  errorCloseBtn: {
    fontSize: '11px',
    padding: '4px 10px',
    color: '#946f3f',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: '1px solid #946f3f',
    borderRadius: '4px',
    marginLeft: '16px',
    fontWeight: 600,
  },
};
