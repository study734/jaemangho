import { cache, Suspense } from 'react';
import Link from 'next/link';
import { DiscoveryDeck, DiscoveryWeek } from '@/components/DiscoveryDeck';
import { contextualizeMoments, discoveryPeople } from '@/server/discovery-context';
import { getChatHighlights } from '@/server/chat/stats';
import { getHotMoments } from '@/server/chat/moments';
import { listHighlights } from '@/server/chat/highlights';
import { listAwards } from '@/server/chat/awards';
import { chatNotice } from '@/server/chat/notice';
import { getHomeFeed } from '@/server/home';
import { HomeMembers } from './home';
import { getViewer } from '@/server/viewer';
import { unstable_cache } from 'next/cache';
import { Home, HomeCommunity, HomeRecent } from './home';
import { getDiscoveryFeed } from '@/server/discovery';

// 성공한 출처만 60초 캐시한다. 두 구역의 동시 조회도 요청 안에서 공유한다.
const cachedChatHighlights = cache(unstable_cache(() => getChatHighlights(), ['home-chat-highlights'], { revalidate: 60 }));
const cachedHotMoments = cache(unstable_cache(() => getHotMoments(5), ['home-hot-moments-v2'], { revalidate: 60 }));
const cachedHighlights = unstable_cache(() => listHighlights(1, 10), ['home-discovery-highlights'], { revalidate: 60 });
const cachedAwards = unstable_cache(() => listAwards(1), ['home-discovery-awards'], { revalidate: 60 });

const cachedPeople = unstable_cache(discoveryPeople, ['home-discovery-people'], { revalidate: 60 });
const cachedMomentContext = unstable_cache(contextualizeMoments, ['home-discovery-context'], { revalidate: 60 });
const discoveryFeed = cache(() => getDiscoveryFeed({ moments: async () => cachedMomentContext(await cachedHotMoments()), highlights: cachedHighlights, awards: cachedAwards, people: cachedPeople }));

async function Discovery({ selected }: { selected: Promise<{ discovery?: string }> }) {
  const [feed, params] = await Promise.all([discoveryFeed(), selected]);
  return <DiscoveryDeck key={params.discovery ?? 'latest'} {...feed} selectedId={params.discovery} />;
}

async function Week() {
  return <DiscoveryWeek {...await discoveryFeed()} />;
}

async function Community() {
  const [chat, moments] = await Promise.allSettled([cachedChatHighlights(), cachedHotMoments()]);
  return <HomeCommunity chat={chat.status === 'fulfilled' ? chat.value : null} moments={moments.status === 'fulfilled' ? moments.value.slice(0, 3) : []} notice={chatNotice()} unavailable={chat.status === 'rejected' || moments.status === 'rejected'} />;
}

// 같은 요청에서 최근 활동과 멤버 목록이 한 번의 조회를 나눠 쓴다
const homeFeed = cache(() => getHomeFeed().catch(() => null));

async function Members() {
  const feed = await homeFeed();
  return feed ? <HomeMembers people={feed.people} /> : null;
}

async function Recent() {
  const feed = await homeFeed();
  if (feed) return <HomeRecent activity={feed.activity} />;
  return <section className="home-data-notice"><p role="status">최근 활동과 접속 기록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p><Link href="/people" className="btn btn-link">전체 멤버 보기 →</Link></section>;
}

function DiscoveryLoading() {
  return <section className="discovery-deck discovery-loading" aria-labelledby="discovery-title" aria-busy="true"><p className="home-eyebrow">재순이의 오늘의 발견</p><h1 id="discovery-title">오늘은 무슨 일이 있었을까?</h1><p role="status">확인된 기록에서 오늘의 발견을 찾고 있어요.</p></section>;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ discovery?: string }> }) {
  const result = await getViewer(); // 레이아웃이 이미 로그인을 확인했다. 여기서는 이름만 쓴다.
  return <Home
    name={result.status === 'ok' ? result.viewer.name : ''}
    discovery={<Suspense fallback={<DiscoveryLoading />}><Discovery selected={searchParams} /></Suspense>}
    week={<Suspense fallback={<section className="home-data-notice" role="status">우리 기록을 고르는 중이에요.</section>}><Week /></Suspense>}
    community={<Suspense fallback={<section className="home-data-notice" role="status">디스코드 활동을 불러오는 중이에요.</section>}><Community /></Suspense>}
    members={<Suspense fallback={<section className="member-list" role="status"><p className="member-empty">멤버를 불러오는 중이에요.</p></section>}><Members /></Suspense>}
    recent={<Suspense fallback={<section className="home-data-notice" role="status">최근 활동을 불러오는 중이에요.</section>}><Recent /></Suspense>}
  />;
}
