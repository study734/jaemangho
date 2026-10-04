'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { sectionOf, sectionsFor } from './nav';

// 상단 메뉴바: 큰 주제(롤, Steam, 설정·관리자)를 고른다. 세부 메뉴는 좌측 사이드바가 보여준다.
export const TopBar: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const pathname = usePathname();
  const router = useRouter();
  const current = sectionOf(pathname);
  return (
    <header style={styles.bar}>
      <div style={styles.brand}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2L2 22H22L12 2Z" stroke="#00ed64" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="14" r="3" fill="#00ed64" />
        </svg>
        <span className="heading-5" style={styles.brandTitle}>재망호</span>
      </div>

      <nav style={styles.tabs} aria-label="주제">
        {sectionsFor(isAdmin).map((s) => (
          <Link
            key={s.id}
            href={s.items[0].href}
            className={`btn btn-ghost ${s.id === current ? 'btn-ghost-active' : ''}`}
            style={styles.tab}
            aria-current={s.id === current ? 'page' : undefined}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <button
        className="btn btn-ghost"
        style={styles.logout}
        onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })}
      >
        로그아웃
      </button>
    </header>
  );
};

const styles = {
  bar: {
    height: '56px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '0 20px',
    backgroundColor: '#001e2b',
    borderBottom: '1px solid #1c4558',
    zIndex: 10,
  },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '120px' },
  brandTitle: { color: '#ffffff', fontWeight: 700, letterSpacing: '-0.3px' },
  tabs: { display: 'flex', gap: '6px', flexGrow: 1 },
  tab: { padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500 },
  logout: { padding: '6px 14px', fontSize: '13px' },
};
