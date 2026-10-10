'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { isActive, primarySectionOf, PRIMARY_DESTINATIONS, sectionOf, sectionsFor } from './nav';
import { SidebarSummary, type SummaryRow } from './Sidebar';
import { UiIcon } from './VisualImage';

// 디스코드식 PC 뼈대: 왼쪽에 주제와 상세 메뉴를 한 목록으로, 위에는 지금 있는 곳의 헤더를 둔다. 모바일은 TopBar와 하단 탭을 쓴다.
export function ChannelSidebar({ summary, isAdmin, userName }: { summary: SummaryRow[]; isAdmin: boolean; userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = primarySectionOf(pathname);
  const section = sectionsFor(isAdmin).find((s) => s.id === sectionOf(pathname))!;
  return (
    <aside className="channel-sidebar">
      <Link href="/" className="channel-brand"><img src="/favicon.svg" width="24" height="24" alt="" aria-hidden="true" />재망호<span className="channel-chevron" aria-hidden="true">⌄</span></Link>
      <nav aria-label="주제">
        {PRIMARY_DESTINATIONS.map((s) => (
          <Link key={s.id} href={s.href} className="channel-link" aria-current={s.id === current ? 'page' : undefined}>
            <UiIcon name={s.icon} size={20} /><span>{s.label}</span>
          </Link>
        ))}
      </nav>
      {section.id !== 'home' && (
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
      <div className="channel-user">
        <span className="channel-user-avatar" aria-hidden="true">{userName.slice(0, 1)}</span>
        <span className="channel-user-name"><b>{userName}</b><small>{isAdmin ? '관리자' : '로그인 중'}</small></span>
        <Link href="/lol/settings" aria-label={isAdmin ? '설정 · 관리자' : '설정'} className="channel-user-btn" aria-current={sectionOf(pathname) === 'settings' ? 'page' : undefined}><UiIcon name="gear" size={20} /></Link>
        <button className="channel-user-btn" aria-label="로그아웃" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })}><UiIcon name="box-arrow-up-right" size={18} /></button>
      </div>
    </aside>
  );
}

export function ChannelHeader({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const sections = sectionsFor(isAdmin);
  const items = sections.flatMap((s) => s.items).filter((i) => isActive(i.href, pathname)).sort((a, b) => b.href.length - a.href.length);
  const title = items[0]?.label ?? sections.find((s) => s.id === sectionOf(pathname))!.label;
  return (
    <header className="channel-header">
      <div className="channel-title">{title}</div>
    </header>
  );
}
