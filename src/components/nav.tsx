import type { ReactNode } from 'react';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export type SectionId = 'lol' | 'steam' | 'settings';

// 상단 메뉴바의 큰 주제와, 각 주제의 좌측 상세 메뉴
export interface Section {
  id: SectionId;
  label: string;
  items: NavItem[];
}

const LOL: NavItem[] = [
  {
    href: '/lol',
    label: '대시보드',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
    ),
  },
  {
    href: '/lol/squad',
    label: '소환사 관리',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
    ),
  },
  {
    href: '/lol/synergy',
    label: '듀오 시너지 분석',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
    ),
  },
  {
    href: '/lol/mastery',
    label: '챔피언 숙련도',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
    ),
  },
];

const STEAM: NavItem[] = [
  {
    href: '/steam',
    label: 'Steam 공통 게임',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="12" rx="4" />
        <path d="M6 12h4M8 10v4" />
        <circle cx="15" cy="11" r="1" />
        <circle cx="18" cy="13" r="1" />
      </svg>
    ),
  },
];

const SETTINGS: NavItem[] = [
  {
    href: '/lol/settings',
    label: '설정',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
    ),
  },
];

const ADMIN: NavItem = {
  href: '/admin',
  label: '관리자',
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
  ),
};

export function sectionsFor(isAdmin: boolean): Section[] {
  return [
    { id: 'lol', label: '롤', items: LOL },
    { id: 'steam', label: 'Steam', items: STEAM },
    { id: 'settings', label: isAdmin ? '설정 · 관리자' : '설정', items: isAdmin ? [...SETTINGS, ADMIN] : SETTINGS },
  ];
}

// 주소로 지금 주제를 정한다. 설정(/lol/settings)은 주소가 /lol 아래지만 "설정" 주제에 속한다.
export function sectionOf(pathname: string): SectionId {
  if (pathname.startsWith('/admin') || pathname.startsWith('/lol/settings')) return 'settings';
  if (pathname.startsWith('/steam')) return 'steam';
  return 'lol';
}

export const isActive = (href: string, pathname: string) => (href === '/lol' ? pathname === '/lol' : pathname.startsWith(href));
