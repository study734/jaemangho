'use client';

import type { CSSProperties, ReactNode } from 'react';
import { summarizeRoster, useLol } from '@/features/lol';
import { Sidebar } from '@/components/Sidebar';

// 앱 틀: 사이드바 + 상단 안내(로딩/오류/동기화) + 현재 화면
export function Frame({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const { members, isLoading, error, dismissError, refreshAll } = useLol();

  return (
    <div style={styles.appContainer}>
      <Sidebar summary={summarizeRoster(members)} isAdmin={isAdmin} />

      <main style={styles.mainPane}>
        {isLoading && (
          <div style={styles.loadingBanner}>
            <span className="pulse-indicator" style={{ marginRight: '8px' }} />
            라이엇 서버로부터 소환사들의 최신 전적을 받아오고 있습니다...
          </div>
        )}

        {error && (
          <div style={styles.errorBanner}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
            <button className="btn" style={styles.errorCloseBtn} onClick={dismissError}>
              닫기
            </button>
          </div>
        )}

        {!isLoading && (
          <div style={styles.syncRow}>
            <button className="btn btn-secondary" style={styles.syncBtn} onClick={() => refreshAll()}>
              🔄 실시간 데이터 강제 동기화
            </button>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  appContainer: { display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' },
  mainPane: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0b2a38',
    position: 'relative',
    overflow: 'hidden',
  },
  loadingBanner: {
    backgroundColor: '#ffb703',
    color: '#001e2b',
    padding: '8px 24px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  syncRow: { padding: '16px 32px 0 32px', display: 'flex', justifyContent: 'flex-end' },
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
