'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { DestinationIcon, MAIN_DESTINATIONS, mainSectionOf, primarySectionOf, PRIMARY_DESTINATIONS } from './nav';
import { UiIcon } from './VisualImage';

// 모든 화면의 상단 바: 로고·목적지 탭·재순이 대화·설정·로그아웃. 로비(홈)는 메뉴 타일이 탭을 대신하므로 탭 없이 키 비주얼 위에 겹친다.
export function TopBar({ onOpenSettings, isAdmin, userName, lobby = false }: { onOpenSettings: () => void; isAdmin: boolean; userName: string; lobby?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = mainSectionOf(pathname);
  return (
    <header className={`app-navigation${lobby ? ' is-lobby' : ''}`} role="banner">
      <Link href="/" className="lobby-logo"><img src="/favicon.svg" width="28" height="28" alt="" aria-hidden="true" />재망호<small>우리의 아지트</small></Link>
      {!lobby && <nav className="app-topic-nav" aria-label="주제">
        {MAIN_DESTINATIONS.map((d) => (
          <Link key={d.id} href={d.href} className="app-topic" aria-current={d.id === current ? 'page' : undefined}>
            <DestinationIcon destination={d} size={20} /><span>{d.label}</span>
          </Link>
        ))}
      </nav>}
      <nav className="lobby-icons" aria-label="바로가기">
        <span className="lobby-user">{userName}</span>
        {isAdmin && <Link href="/admin" className="lobby-chip" aria-current={pathname.startsWith('/admin') ? 'page' : undefined}>관리자</Link>}
        <Link href="/chat" className="lobby-icon" aria-label="재순이와 대화" aria-current={pathname === '/chat' ? 'page' : undefined}><UiIcon name="star" size={20} /></Link>
        <button type="button" className="lobby-icon" aria-label="설정" aria-haspopup="dialog" onClick={onOpenSettings}><UiIcon name="gear" size={20} /></button>
        <button type="button" className="lobby-chip" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })}>로그아웃</button>
      </nav>
    </header>
  );
}

// 모바일 하단 탭: 한 손으로 닿는 네 목적지
export function MobileNavigation() {
  const current = primarySectionOf(usePathname());
  return <nav className="mobile-navigation" aria-label="주요 메뉴">{PRIMARY_DESTINATIONS.map(s => (
    <Link key={s.id} href={s.href} aria-current={s.id === current ? 'page' : undefined}><UiIcon name={s.icon} size={20} /><span>{s.label}</span></Link>
  ))}</nav>;
}
