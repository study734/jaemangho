import type { ReactNode } from 'react';
import Link from 'next/link';
import { HomeCard } from '@/components/HomeCard';
import { ServiceMark, UiIcon, VisualImage } from '@/components/VisualImage';
import { LolHomeSummary } from '@/features/lol';
import { scoreLabel } from '@/lib/chat-format';
import type { HotMoment } from '@/server/chat/moments';
import type { ChatHighlights } from '@/server/chat/stats';
import { SteamHomeSearch, SteamHomeSummary } from '@/features/steam';

interface Activity {
  kind: 'lol' | 'steam' | 'login';
  actor: string;
  target: string;
  at: string;
}
interface Person {
  id: string;
  name: string;
  at: string;
  image: string | null;
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
const Ago = ({ iso }: { iso: string }) => <span style={styles.ago}>{timeAgo(iso)}</span>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.panel}>
      <h3 className="heading-5" style={styles.panelTitle}>{title}</h3>
      {children}
    </section>
  );
}

// 그룹 홈. 새 주제가 생기면 그 기능의 HomeSummary를 만들어 오른쪽에 카드를 하나 더한다.
const hourLabel = (h: number) => `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`;

// 채팅 하이라이트: 내용은 읽지 않고, 반응 수와 메시지 수만 집계한 것
function ChatPanels({ chat, moments, notice }: { chat: ChatHighlights; moments: HotMoment[]; notice: string }) {
  return (
    <>
      {chat.hallOfFame.length > 0 && (
        <Panel title="명예의 전당 (이번 주)">
          <ul style={styles.list}>
            {chat.hallOfFame.map((h) => (
              <li key={h.url} style={styles.row}>
                <span style={styles.tag}>{scoreLabel(h.topEmoji, h.reactions, h.replies)}</span>
                <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ ...styles.text, color: 'var(--ink)' }}>
                  {h.authorName}님의 메시지 보러 가기
                </a>
                <Ago iso={h.at} />
              </li>
            ))}
          </ul>
          <p style={styles.hint}>{notice} 링크를 누르면 디스코드로 이동합니다. <Link href="/community" style={{ color: 'var(--primary)' }}>개념글 보관함 →</Link></p>
        </Panel>
      )}
      {moments.length > 0 && (
        <Panel title="뜨거웠던 순간">
          <ul style={styles.list}>
            {moments.map((m) => (
              <li key={m.url} style={styles.row}>
                <span style={styles.tag}>🔥 {m.messages}개</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ ...styles.text, color: 'var(--ink)' }}>{m.people}명이 10분 동안 몰려서 말했어요</a>
                <Ago iso={m.at} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {chat.hallOfFame.length === 0 && <Panel title="수다 통계 (이번 주)">
        <ul style={styles.list}>
          {chat.talkers.map((t, i) => (
            <li key={t.userId ?? t.name} style={styles.row}>
              <span style={styles.rank}>{i + 1}</span>
              {t.userId ? <Link href={`/people/${t.userId}`} style={{ ...styles.text, color: 'var(--ink)' }}>{t.name}</Link> : <span style={styles.text}>{t.name}</span>}
              <span style={styles.ago}>{t.count.toLocaleString()}개</span>
            </li>
          ))}
        </ul>
        <p style={styles.hint}>
          메시지 {chat.total.toLocaleString()}개{chat.peakHour !== null && <> · 가장 활발한 시간 {hourLabel(chat.peakHour)}</>}
        </p>
      </Panel>}
      {chat.hallOfFame.length > 0 && <p style={styles.hint}>이번 주 메시지 {chat.total.toLocaleString()}개{chat.peakHour !== null && <> · 가장 활발한 시간 {hourLabel(chat.peakHour)}</>}</p>}
    </>
  );
}

export function HomeCommunity({ chat, moments, notice, unavailable = false }: { chat: ChatHighlights | null; moments: HotMoment[]; notice: string; unavailable?: boolean }) {
  return (
        <section className="home-community" style={styles.panel} aria-labelledby="community-title">
          <div className="home-section-heading community-graphic-heading"><div>
            <h2 id="community-title" className="visual-heading"><ServiceMark service="discord" size={32} />이번 주 디스코드 활동</h2>
            <Link href="/community" className="btn btn-link">커뮤 보기</Link>
          </div></div>
          {unavailable && <p role="status" style={styles.hint}>일부 디스코드 활동을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
          {chat ? <ChatPanels chat={chat} moments={moments} notice={notice} /> : !unavailable && <p style={styles.hint}>아직 모아 둔 활동이 없어요. 커뮤니티에서 소식을 확인해 보세요.</p>}
        </section>
  );
}

export function HomeRecent({ activity }: { activity: Activity[] }) {
  return (
    <section className="home-activity" aria-labelledby="activity-title">
      <h2 id="activity-title" className="home-section-label">최근 활동</h2>
      {activity.length === 0 ? <p style={styles.hint}>아직 활동이 없습니다.</p> : (
        <ul className="activity-feed">{activity.map((a, i) => (
          <li key={i}><span className="activity-tag">{TAG[a.kind]}</span><span>{sentence(a)}</span><Ago iso={a.at} /></li>
        ))}</ul>
      )}
    </section>
  );
}

// 디스코드 멤버 목록의 문법: 그룹 라벨(이름 — 수), 32px 아바타 행. 로그인 기록이라 접속 중 표시(상태 점)는 쓰지 않는다.
export function HomeMembers({ people }: { people: Person[] }) {
  return (
    <section className="member-list" aria-labelledby="members-title">
      <h2 id="members-title" className="member-group">최근 접속 — {people.length}</h2>
      {people.length === 0 ? <p className="member-empty">아직 접속 기록이 없어요.</p> : (
        <ul>{people.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.id}`} className="member-row">
              <VisualImage src={p.image} fallback={p.name.slice(0, 1)} width={32} height={32} className="member-avatar" />
              <span className="member-name">{p.name}</span>
              <span className="member-ago">{timeAgo(p.at)}</span>
            </Link>
          </li>
        ))}</ul>
      )}
      <Link href="/people" className="member-all">전체 멤버 보기 →</Link>
    </section>
  );
}

export function Home({ name, discovery, community, recent, week, members }: { name: string; discovery: ReactNode; community: ReactNode; recent: ReactNode; week: ReactNode; members: ReactNode }) {
  return (
    <div className="home-page" style={styles.container}>
      <div className="home-discovery-grid">
        {discovery}
        <aside className="home-action-stack" aria-label="게임 찾기와 바로 놀기">
        <section className="home-play" aria-labelledby="play-title">
          <h2 id="play-title">지금 같이 놀기</h2>
          <p>{name}님, 멤버만 고르면 시작할 수 있어요.</p>
          <Link href="/steam" className="btn btn-primary"><ServiceMark service="steam" size={22} />같이 할 게임 찾기<UiIcon name="arrow-right" /></Link>
          <div className="home-play-links"><Link href="/steam">오늘의 게임 뽑기 →</Link><Link href="/play">LoL · 도전 과제 →</Link></div>
        </section>

      <section className="home-steam" aria-labelledby="steam-title">
        <div className="home-steam-top">
        <div>
          <h2 id="steam-title" className="visual-heading"><ServiceMark service="steam" size={36} />Steam 공통 게임 찾기</h2>
        </div>
        </div>
        <div className="home-steam-meta"><div className="home-steam-summary"><SteamHomeSummary /></div><Link href="/steam" className="btn btn-link">공통 게임 찾기<UiIcon name="arrow-right" /></Link></div>
        <SteamHomeSearch />
      </section>
        {members}
        </aside>
      </div>

      {week}

      <div className="home-grid">
        <HomeCard title="롤" subtitle="친구들의 랭크와 게임 현황" className="home-lol-card" icon={<ServiceMark service="leagueoflegends" size={40} />} href="/lol" cta="롤 현황 보기"><LolHomeSummary /></HomeCard>
        {community}
      </div>

      {recent}
    </div>
  );
}

const styles = {
  container: { flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: 'clamp(40px, 5vw, 64px)', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  hint: { color: 'var(--slate)', fontSize: '14px' },
  side: { display: 'flex', flexDirection: 'column' as const, gap: '24px', minWidth: 0 },
  panel: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '8px', padding: 'var(--panel-padding)', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  panelTitle: { color: 'var(--ink)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--hairline)', fontSize: '14px', color: 'var(--ink)' },
  rank: { color: 'var(--steel)', width: '16px', fontSize: '12px' },
  tag: { fontSize: '11px', fontWeight: 700, color: 'var(--primary)', border: '1px solid var(--hairline)', borderRadius: '4px', padding: '2px 8px', whiteSpace: 'nowrap' as const },
  text: { flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' as const },
  ago: { color: 'var(--steel)', fontSize: '12px', whiteSpace: 'nowrap' as const },
};
