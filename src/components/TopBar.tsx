'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { primarySectionOf, PRIMARY_DESTINATIONS } from './nav';
import { UiIcon } from './VisualImage';

export function TopBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = primarySectionOf(pathname);
  return (
    <header className="app-navigation">
      <Link href="/" className="app-brand">
        <div className="app-brand-name"><img src="/favicon.svg" width="24" height="24" alt="" aria-hidden="true" />재망호</div>
        <span>JAEMANGHO</span>
      </Link>
      <nav className="app-topic-nav" aria-label="주제">
        {PRIMARY_DESTINATIONS.map((s) => (
          <Link key={s.id} href={s.href} className={`btn btn-ghost app-topic ${s.id === current ? 'btn-ghost-active' : ''}`} aria-current={s.id === current ? 'page' : undefined}>
            <UiIcon name={s.icon} size={20} /><span>{s.label}</span>
          </Link>
        ))}
      </nav>
      <Link href="/lol/settings" aria-label={isAdmin ? '설정 · 관리자' : '설정'} className={`btn btn-ghost app-settings ${current === 'settings' ? 'btn-ghost-active' : ''}`} aria-current={current === 'settings' ? 'page' : undefined}><UiIcon name="gear" /><span>{isAdmin ? '설정 · 관리자' : '설정'}</span></Link>
      <button className="btn btn-ghost app-logout" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })}>로그아웃</button>
    </header>
  );
}

export function MobileNavigation() {
  const current = primarySectionOf(usePathname());
  return <nav className="mobile-navigation" aria-label="주요 메뉴">{PRIMARY_DESTINATIONS.map(s => (
    <Link key={s.id} href={s.href} aria-current={s.id === current ? 'page' : undefined}><UiIcon name={s.icon} size={20} /><span>{s.label}</span></Link>
  ))}</nav>;
}
