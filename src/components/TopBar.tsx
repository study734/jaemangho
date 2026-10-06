'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { sectionOf, sectionsFor } from './nav';
import { ServiceMark, UiIcon } from './VisualImage';

export function TopBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = sectionOf(pathname);
  return (
    <header className="app-navigation">
      <Link href="/" className="app-brand">재망호<span>JAEMANGHO</span></Link>
      <nav className="app-topic-nav" aria-label="주제">
        {sectionsFor(isAdmin).map((s) => (
          <Link key={s.id} href={s.items[0].href} className={`btn btn-ghost app-topic ${s.id === current ? 'btn-ghost-active' : ''}`} aria-current={s.id === current ? 'page' : undefined}>
            {s.id === 'lol' ? <ServiceMark service="leagueoflegends" size={22} /> : s.id === 'steam' ? <ServiceMark service="steam" size={22} /> : s.id === 'community' ? <ServiceMark service="discord" size={22} /> : <UiIcon name={s.id === 'home' ? 'house-door' : s.id === 'people' ? 'people' : 'gear'} size={20} />}<span>{s.label}</span>
          </Link>
        ))}
      </nav>
      <button className="btn btn-ghost app-logout" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })}>로그아웃</button>
    </header>
  );
}
