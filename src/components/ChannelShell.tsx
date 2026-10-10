'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { isActive, primarySectionOf, PRIMARY_DESTINATIONS, sectionOf, sectionsFor } from './nav';
import { SidebarSummary, type SummaryRow } from './Sidebar';
import { ServiceMark, UiIcon } from './VisualImage';

export function ServerRail() {
  const section = sectionOf(usePathname());
  return <nav className="server-rail" aria-label="빠른 채널 이동">
    <Link href="/" className="server-shortcut server-home" aria-label="재망호 홈 채널" aria-current={section === 'home' ? 'page' : undefined}><img src="/favicon.svg" width={28} height={28} alt="" /></Link>
    <span className="server-divider" aria-hidden="true" />
    {([
      { href: '/steam', section: 'steam', service: 'steam', label: 'Steam 게임 채널' },
      { href: '/lol', section: 'lol', service: 'leagueoflegends', label: '롤 게임 채널' },
      { href: '/community', section: 'community', service: 'discord', label: '디스코드 기록 채널' },
    ] as const).map(item => <Link key={item.href} href={item.href} className="server-shortcut" aria-label={item.label} title={item.label} aria-current={section === item.section ? 'page' : undefined}><ServiceMark service={item.service} size={24} /></Link>)}
  </nav>;
}

// 디스코드식 PC 뼈대: 왼쪽에 주제와 상세 메뉴를 한 목록으로, 위에는 지금 있는 곳의 헤더를 둔다. 모바일은 TopBar와 하단 탭을 쓴다.
export function ChannelSidebar({ summary, isAdmin, userName }: { summary: SummaryRow[]; isAdmin: boolean; userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = primarySectionOf(pathname);
  const section = sectionsFor(isAdmin).find((s) => s.id === sectionOf(pathname))!;
  return (
    <aside className="channel-sidebar">
      <Link href="/" className="channel-brand">재망호<span className="channel-brand-caption">우리의 아지트</span></Link>
      <div className="channel-scroll">
      <nav aria-label="주제">
        <p className="channel-label">재망호 채널</p>
        {PRIMARY_DESTINATIONS.filter(s => s.id !== 'people').map((s) => (
          <Link key={s.id} href={s.href} className="channel-link" aria-current={s.id === current ? 'page' : undefined}>
            <UiIcon name={s.icon} size={20} /><span>{s.label}</span>
          </Link>
        ))}
      </nav>
      {section.id !== 'home' && section.id !== 'people' && (
        <nav aria-label={`${section.label} 상세 메뉴`} className="channel-details">
          <p className="channel-label">{section.label}</p>
          {section.items.map((item) => (
            <Link key={item.href} href={item.href} className="channel-link" aria-current={isActive(item.href, pathname) ? 'page' : undefined}>
              <span className="channel-hash" aria-hidden="true">#</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      )}
      {section.id === 'lol' && <SidebarSummary summary={summary} />}
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
