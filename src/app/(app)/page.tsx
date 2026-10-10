import { getChatHighlights } from '@/server/chat/stats';
import { getHotMoments } from '@/server/chat/moments';
import { chatNotice } from '@/server/chat/notice';
import { getHomeFeed } from '@/server/home';
import { getViewer } from '@/server/viewer';
import { unstable_cache } from 'next/cache';
import { Home } from './home';

// 채팅 수집은 하루 한 번이지만 홈 방문마다 최근 7~8일을 다시 집계하지 않는다.
const cachedChatHighlights = unstable_cache(() => getChatHighlights(), ['home-chat-highlights'], { revalidate: 60 });
const cachedHotMoments = unstable_cache(() => getHotMoments(3), ['home-hot-moments'], { revalidate: 60 });

export default async function HomePage() {
  const result = await getViewer(); // 레이아웃이 이미 로그인을 확인했다. 여기서는 이름만 쓴다.
  // 채팅 하이라이트는 봇이 아직 없거나 오류가 나도 홈 전체를 막지 않는다
  const [feed, chat, moments] = await Promise.all([getHomeFeed(), cachedChatHighlights().catch(() => null), cachedHotMoments().catch(() => [])]);
  return <Home name={result.status === 'ok' ? result.viewer.name : ''} {...feed} chat={chat} moments={moments} notice={chatNotice()} />;
}
