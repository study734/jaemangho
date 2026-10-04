'use client';

import { HomeCard } from '@/components/HomeCard';
import { LolHomeSummary } from '@/features/lol';
import { SteamHomeSummary } from '@/features/steam';

// 그룹 홈. 새 주제가 생기면 그 기능의 HomeSummary를 만들어 아래에 카드를 하나 더한다.
export function Home({ name }: { name: string }) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>재망호</h2>
        <p style={styles.hint}>{name}님, 오늘은 뭘 같이 할까요?</p>
      </header>
      <div style={styles.grid}>
        <HomeCard title="롤" href="/lol" cta="롤 대시보드">
          <LolHomeSummary />
        </HomeCard>
        <HomeCard title="Steam" href="/steam" cta="공통 게임 찾기">
          <SteamHomeSummary />
        </HomeCard>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: '32px', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid #1c4558', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  hint: { color: '#a8b3bc', fontSize: '14px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', alignItems: 'stretch' },
};
