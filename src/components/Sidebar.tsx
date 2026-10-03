import React from 'react';
import type { Member } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  members: Member[];
  isAdmin: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, members, isAdmin }) => {
  const activeCount = members.filter(m => m.activeGame !== null).length;
  
  // Find top ranked player
  const getTopPlayer = () => {
    if (members.length === 0) return '없음';
    const tierPriority = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'];
    
    let topPlayer = members[0];
    let minIdx = 99;

    members.forEach(m => {
      const idx = tierPriority.indexOf(m.tier);
      if (idx < minIdx) {
        minIdx = idx;
        topPlayer = m;
      }
    });

    return `${topPlayer.gameName} (${topPlayer.tier})`;
  };

  return (
    <aside style={styles.sidebar}>
      {/* Brand Header */}
      <div style={styles.brandContainer}>
        <div style={styles.logoCircle}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 22H22L12 2Z" stroke="#00ed64" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="14" r="3" fill="#00ed64"/>
          </svg>
        </div>
        <div>
          <h1 className="heading-5" style={styles.brandTitle}>재망호</h1>
          <span className="micro-uppercase" style={styles.brandSubtitle}>LoL Tracker</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={styles.nav}>
        <button
          className={`btn btn-ghost ${activeTab === 'dashboard' ? 'btn-ghost-active' : ''}`}
          style={styles.navButton}
          onClick={() => setActiveTab('dashboard')}
        >
          <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
          <span style={styles.navText}>대시보드</span>
        </button>

        <button
          className={`btn btn-ghost ${activeTab === 'squad' ? 'btn-ghost-active' : ''}`}
          style={styles.navButton}
          onClick={() => setActiveTab('squad')}
        >
          <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={styles.navText}>크루 멤버 관리</span>
        </button>

        <button
          className={`btn btn-ghost ${activeTab === 'synergy' ? 'btn-ghost-active' : ''}`}
          style={styles.navButton}
          onClick={() => setActiveTab('synergy')}
        >
          <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span style={styles.navText}>듀오 시너지 분석</span>
        </button>

        <button
          className={`btn btn-ghost ${activeTab === 'mastery' ? 'btn-ghost-active' : ''}`}
          style={styles.navButton}
          onClick={() => setActiveTab('mastery')}
        >
          <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span style={styles.navText}>챔피언 숙련도</span>
        </button>

        <button
          className={`btn btn-ghost ${activeTab === 'settings' ? 'btn-ghost-active' : ''}`}
          style={styles.navButton}
          onClick={() => setActiveTab('settings')}
        >
          <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span style={styles.navText}>설정</span>
        </button>

        {isAdmin && (
          <button
            className={`btn btn-ghost ${activeTab === 'admin' ? 'btn-ghost-active' : ''}`}
            style={styles.navButton}
            onClick={() => setActiveTab('admin')}
          >
            <svg style={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span style={styles.navText}>관리자</span>
          </button>
        )}
      </nav>

      {/* Summary Info Box */}
      <div style={styles.summaryContainer}>
        <div style={styles.summaryTitle}>크루 요약 정보</div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>전체 대원</span>
          <span style={styles.summaryValue}>{members.length}명</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>전투 중 (실시간)</span>
          <span style={styles.summaryValueActive}>
            <span className="pulse-indicator" style={{ marginRight: '6px' }} />
            {activeCount}명
          </span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>대장 주주</span>
          <span style={styles.summaryValueTop} title={getTopPlayer()}>
            {getTopPlayer()}
          </span>
        </div>
      </div>

      {/* Footer Info / GitHub Pages badge */}
      <div style={styles.footer}>
        {!import.meta.env.DEV && (
          <a className="btn btn-ghost" style={styles.logout} href="/api/auth/logout">
            로그아웃
          </a>
        )}
        <div style={styles.footerText}>
          Jaemangho LoL Client v1.2
        </div>
      </div>
    </aside>
  );
};

const styles = {
  sidebar: {
    width: '260px',
    backgroundColor: '#001e2b',
    borderRight: '1px solid #1c4558',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    zIndex: 10,
  },
  brandContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '36px',
    paddingLeft: '4px',
  },
  logoCircle: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: 'rgba(0, 237, 100, 0.1)',
    border: '1px solid rgba(0, 237, 100, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: '#ffffff',
    fontWeight: 700,
    letterSpacing: '-0.3px',
    lineHeight: '1.2',
  },
  brandSubtitle: {
    color: '#00ed64',
    fontSize: '9.5px',
    letterSpacing: '1.2px',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flexGrow: 1,
  },
  navButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '12px',
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    textAlign: 'left' as const,
    transition: 'all 0.15s ease',
  },
  navIcon: {
    width: '18px',
    height: '18px',
  },
  navText: {
    fontSize: '14px',
    fontWeight: 500,
  },
  summaryContainer: {
    backgroundColor: 'rgba(14, 53, 71, 0.5)',
    border: '1px solid #143747',
    borderRadius: '10px',
    padding: '14px',
    marginBottom: '20px',
  },
  summaryTitle: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    color: '#7c8c9a',
    marginBottom: '10px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '13px',
  },
  summaryLabel: {
    color: '#a8b3bc',
  },
  summaryValue: {
    fontWeight: 600,
    color: '#ffffff',
  },
  summaryValueActive: {
    fontWeight: 600,
    color: '#00ed64',
    display: 'flex',
    alignItems: 'center',
  },
  summaryValueTop: {
    fontWeight: 600,
    color: '#ffb703',
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: 'auto',
    paddingTop: '16px',
    borderTop: '1px solid #143747',
  },
  logout: {
    width: '100%',
    justifyContent: 'center',
    marginBottom: '12px',
    padding: '8px 14px',
    fontSize: '13px',
  },
  footerText: {
    fontSize: '11px',
    color: '#5c6c7a',
  }
};
