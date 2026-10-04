'use client';

import type { ReactNode } from 'react';
import { HomeCard } from '@/components/HomeCard';
import { LolHomeSummary } from '@/features/lol';
import { SteamHomeSummary } from '@/features/steam';

interface Activity {
  kind: 'lol' | 'steam' | 'login';
  actor: string;
  target: string;
  at: string;
}
interface Person {
  name: string;
  at: string;
}

const sentence = (a: Activity) => {
  const who = a.actor || '누군가';
  if (a.kind === 'lol') return `${who}님이 소환사 ${a.target}을(를) 등록했어요`;
  if (a.kind === 'steam') return `${who}님이 Steam 멤버 ${a.target}을(를) 등록했어요`;
  return `${who}님이 접속했어요`;
};
const TAG = { lol: '롤', steam: 'Steam', login: '접속' } as const;

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 60 / 24)}일 전`;
}
// 서버와 브라우저의 시각이 다르므로 시간 표시는 하이드레이션 경고를 끈다
const Ago = ({ iso }: { iso: string }) => <span suppressHydrationWarning style={styles.ago}>{timeAgo(iso)}</span>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.panel}>
      <h3 className="heading-5" style={styles.panelTitle}>{title}</h3>
      {children}
    </section>
  );
}

// 그룹 홈. 새 주제가 생기면 그 기능의 HomeSummary를 만들어 오른쪽에 카드를 하나 더한다.
export function Home({ name, activity, people }: { name: string; activity: Activity[]; people: Person[] }) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>재망호</h2>
        <p style={styles.hint}>{name}님, 오늘은 뭘 같이 할까요?</p>
      </header>

      <div style={styles.grid}>
        <Panel title="최근 활동">
          {activity.length === 0 ? (
            <p style={styles.hint}>아직 활동이 없습니다.</p>
          ) : (
            <ul style={styles.list}>
              {activity.map((a, i) => (
                <li key={i} style={styles.row}>
                  <span style={styles.tag}>{TAG[a.kind]}</span>
                  <span style={styles.text}>{sentence(a)}</span>
                  <Ago iso={a.at} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div style={styles.side}>
          <HomeCard title="롤" href="/lol" cta="롤 대시보드">
            <LolHomeSummary />
          </HomeCard>
          <HomeCard title="Steam" href="/steam" cta="공통 게임 찾기">
            <SteamHomeSummary />
          </HomeCard>
          <Panel title="멤버">
            <ul style={styles.list}>
              {people.map((p) => (
                <li key={p.name} style={styles.row}>
                  <span style={styles.text}>{p.name}</span>
                  <Ago iso={p.at} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: '32px', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid #1c4558', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  hint: { color: '#a8b3bc', fontSize: '14px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' },
  side: { display: 'flex', flexDirection: 'column' as const, gap: '24px' },
  panel: { backgroundColor: '#001e2b', border: '1px solid #1c4558', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  panelTitle: { color: '#ffffff' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #1c4558', fontSize: '14px', color: '#ffffff' },
  tag: { fontSize: '11px', fontWeight: 700, color: '#00ed64', border: '1px solid rgba(0, 237, 100, 0.4)', borderRadius: '999px', padding: '2px 8px', whiteSpace: 'nowrap' as const },
  text: { flexGrow: 1, minWidth: 0 },
  ago: { color: '#7c8c9a', fontSize: '12px', whiteSpace: 'nowrap' as const },
};
