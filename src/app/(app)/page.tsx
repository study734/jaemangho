import { getViewer } from '@/server/viewer';
import { Home } from './home';

export default async function HomePage() {
  const result = await getViewer(); // 레이아웃이 이미 로그인을 확인했다. 여기서는 이름만 쓴다.
  return <Home name={result.status === 'ok' ? result.viewer.name : ''} />;
}
