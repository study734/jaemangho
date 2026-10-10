'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { primarySectionOf, PRIMARY_DESTINATIONS } from './nav';
import { UiIcon } from './VisualImage';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
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
      <button type="button" aria-label="설정" aria-haspopup="dialog" className="btn btn-ghost app-settings" onClick={onOpenSettings}><UiIcon name="gear" /><span>설정</span></button>
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
