import { getChatHighlights } from '@/server/chat/stats';
import { getHomeFeed } from '@/server/home';
import { getViewer } from '@/server/viewer';
import { Home } from './home';

export default async function HomePage() {
  const result = await getViewer(); // 레이아웃이 이미 로그인을 확인했다. 여기서는 이름만 쓴다.
  // 채팅 하이라이트는 봇이 아직 없거나 오류가 나도 홈 전체를 막지 않는다
  const [feed, chat] = await Promise.all([getHomeFeed(), getChatHighlights().catch(() => null)]);
  return <Home name={result.status === 'ok' ? result.viewer.name : ''} {...feed} chat={chat} />;
}
