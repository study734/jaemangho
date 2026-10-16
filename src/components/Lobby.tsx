import Link from 'next/link';
import type { ReactNode } from 'react';
import { DestinationIcon, MAIN_DESTINATIONS } from './nav';
import { VisualImage } from './VisualImage';

// 홈의 첫 화면: 재순이가 있는 로비. 발견 카드(discovery)와 최근 접속(party)은 호출한 쪽이 채운다.
export function Lobby({ discovery, party }: { discovery: ReactNode; party: ReactNode }) {
  return <section className="lobby" aria-label="재망호 로비">
    <VisualImage src="/images/jaesuni-home.webp" alt="게임패드를 든 재망호 막내 재순이" fallback="" width={1942} height={809} className="lobby-art" />
    <div className="lobby-veil" aria-hidden="true" />
    <div className="lobby-edge" aria-hidden="true" />
    <div className="lobby-main">{discovery}</div>
    {party}
    <nav className="lobby-menu" aria-label="로비 메뉴">
      {MAIN_DESTINATIONS.map((tile, i) => <Link key={tile.href} href={tile.href} className="lobby-tile" aria-current={i === 0 ? 'page' : undefined}>
        <span className="lobby-tile-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <span className="lobby-tile-icon"><DestinationIcon destination={tile} size={30} /></span>
        <b>{tile.label}</b><span>{tile.sub}</span>
      </Link>)}
    </nav>
  </section>;
}
