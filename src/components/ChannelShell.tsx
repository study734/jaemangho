'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { isActive, PRIMARY_DESTINATIONS, sectionOf, sectionsFor } from './nav';
import { SidebarSummary, type SummaryRow } from './Sidebar';
import { UiIcon } from './VisualImage';

export function ServerRail() {
  return <nav className="server-rail" aria-label="서버 목록">
    <Link href="/" className="server-shortcut server-home" aria-label="재망호 서버" title="재망호 서버" aria-current="true"><img src="/favicon.svg" width={28} height={28} alt="" /></Link>
  </nav>;
}

// 재망호 서버의 목록은 채널 이동에도 유지한다. 모바일은 TopBar와 하단 탭을 쓴다.
export function ChannelSidebar({ summary, isAdmin, userName }: { summary: SummaryRow[]; isAdmin: boolean; userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sections = sectionsFor(isAdmin);
  const categories = sections.filter(s => ['steam', 'lol', 'community', 'settings'].includes(s.id));
  return (
    <aside className="channel-sidebar">
      <Link href="/" className="channel-brand">재망호<span className="channel-brand-caption">우리의 아지트</span></Link>
      <div className="channel-scroll">
      <nav aria-label="주제">
        {PRIMARY_DESTINATIONS.filter(s => s.id !== 'people').map((s) => (
          <Link key={s.id} href={s.href} className="channel-link" aria-current={isActive(s.href, pathname) ? 'page' : undefined}>
            <span className="channel-hash" aria-hidden="true">#</span><span>{s.label}</span>
          </Link>
        ))}
      </nav>
      {categories.map(category => (
        <details key={category.id} className="channel-category" open>
          <summary className="channel-category-label">{category.id === 'community' ? '우리 기록' : category.label}</summary>
          <nav aria-label={`${category.label} 상세 메뉴`} className="channel-details">
          {category.items.map((item) => (
            <Link key={item.href} href={item.href} className="channel-link" aria-current={isActive(item.href, pathname) ? 'page' : undefined}>
              <span className="channel-hash" aria-hidden="true">#</span><span>{item.label}</span>
            </Link>
          ))}
          </nav>
        </details>
      ))}
      {sectionOf(pathname) === 'lol' && <SidebarSummary summary={summary} />}
      </div>
      <div className="channel-user">
        <span className="channel-user-avatar" aria-hidden="true">{userName.slice(0, 1)}</span>
        <span className="channel-user-name"><b>{userName}</b><small>{isAdmin ? '관리자' : '로그인 중'}</small></span>
        <Link href="/lol/settings" aria-label={isAdmin ? '설정 · 관리자' : '설정'} className="channel-user-btn" aria-current={sectionOf(pathname) === 'settings' ? 'page' : undefined}><UiIcon name="gear" size={20} /></Link>
        <button className="channel-user-btn" aria-label="로그아웃" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })}><UiIcon name="box-arrow-up-right" size={18} /></button>
      </div>
    </aside>
  );
}

export function ChannelHeader({ isAdmin, membersVisible, onToggleMembers }: { isAdmin: boolean; membersVisible: boolean; onToggleMembers: () => void }) {
  const pathname = usePathname();
  const sections = sectionsFor(isAdmin);
  const items = sections.flatMap((s) => s.items).filter((i) => isActive(i.href, pathname)).sort((a, b) => b.href.length - a.href.length);
  const title = items[0]?.label ?? sections.find((s) => s.id === sectionOf(pathname))!.label;
  const description = sectionOf(pathname) === 'home' ? '취향은 제각각, 모이는 곳은 하나.' : sections.find(s => s.id === sectionOf(pathname))!.label;
  return (
    <header className="channel-header">
      <div className="channel-title">{title}</div>
      <span className="channel-description">{description}</span>
      {pathname === '/' ? <button type="button" className="channel-header-link member-panel-toggle" aria-label="멤버 활동 패널" aria-expanded={membersVisible} aria-controls="home-member-panel" title="멤버 활동 패널" onClick={onToggleMembers}><UiIcon name="people" size={20} /></button> : <Link href="/people" className="channel-header-link" aria-label="멤버 프로필 보기" title="멤버 프로필 보기"><UiIcon name="people" size={20} /></Link>}
    </header>
  );
}
