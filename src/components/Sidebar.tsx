'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, sectionOf, sectionsFor } from './nav';

// 요약 상자의 한 줄. 각 기능(feature)이 이 모양에 맞춰 값을 만들어 넘긴다.
export interface SummaryRow {
  label: string;
  value: string;
  tone?: 'live' | 'highlight';
}

interface SidebarProps {
  isAdmin: boolean;
}


export function SidebarSummary({ summary }: { summary: SummaryRow[] }) {
  return (
    <div className="sidebar-summary" style={styles.summaryContainer}>
      <div style={styles.summaryTitle}>요약 정보</div>
      {summary.map((row) => (
        <div key={row.label} style={styles.summaryItem}>
          <span style={styles.summaryLabel}>{row.label}</span>
          {row.tone === 'live' ? (
            <span style={styles.summaryValueActive}>
              <span className="pulse-indicator" style={{ marginRight: '6px' }} />
              {row.value}
            </span>
          ) : (
            <span style={row.tone === 'highlight' ? styles.summaryValueTop : styles.summaryValue} title={row.value}>
              {row.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({ isAdmin }) => {
  const pathname = usePathname();
  const section = sectionsFor(isAdmin).find((s) => s.id === sectionOf(pathname))!;
  return (
    <aside className={`detail-sidebar${section.items.length === 1 ? ' detail-sidebar-single' : ''}`} style={styles.sidebar}>
      <div style={styles.sectionTitle}>{section.label}</div>

      <nav aria-label={`${section.label} 상세 메뉴`} style={styles.nav}>
        {section.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href, pathname) ? 'page' : undefined}
            className={`btn btn-ghost ${isActive(item.href, pathname) ? 'btn-ghost-active' : ''}`}
            style={styles.navButton}
          >
            {item.icon}
            <span style={styles.navText}>{item.label}</span>
          </Link>
        ))}
      </nav>

    </aside>
  );
};

const styles = {
  sidebar: {
    width: '220px',
    backgroundColor: 'var(--canvas-dark)',
    borderRight: '1px solid var(--hairline)',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    zIndex: 10,
  },
  sectionTitle: {
    color: 'var(--steel)',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    padding: '0 14px',
    marginBottom: '12px',
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
  navText: {
    fontSize: '14px',
    fontWeight: 500,
  },
  summaryContainer: {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--hairline-soft)',
    borderRadius: '10px',
    padding: '14px',
    marginBottom: '20px',
  },
  summaryTitle: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    color: 'var(--steel)',
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
    color: 'var(--slate)',
  },
  summaryValue: {
    fontWeight: 600,
    color: 'var(--ink)',
  },
  summaryValueActive: {
    fontWeight: 600,
    color: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
  },
  summaryValueTop: {
    fontWeight: 600,
    color: 'var(--accent-pink)',
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
