import { headers } from 'next/headers';
import { auth } from './auth';
import { db } from './db';

export interface Viewer {
  id: string;
  name: string;
  isAdmin: boolean;
}

export type ViewerResult = { status: 'ok'; viewer: Viewer } | { status: 'anonymous' } | { status: 'blocked' };

// 개발 서버 전용 로그인 우회. NODE_ENV가 development일 때만 켜지므로 배포 빌드에서는 동작하지 않는다.
const devLogin = () => process.env.NODE_ENV === 'development' && process.env.DEV_LOGIN === '1';

// 지금 요청의 사용자. 서버 컴포넌트와 라우트 핸들러 어디서든 쓴다.
export async function getViewer(): Promise<ViewerResult> {
  if (devLogin()) return { status: 'ok', viewer: { id: 'dev', name: '개발자', isAdmin: true } };

  // 요청 헤더를 먼저 읽는다: 이 페이지/핸들러를 동적 렌더링으로 표시해, 빌드 중에 DB에 접속하지 않게 한다.
  const requestHeaders = await headers();
  await db(); // 로그인 라이브러리의 테이블이 만들어진 뒤에 세션을 조회한다
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { status: 'anonymous' };

  const user = session.user as typeof session.user & { role?: string | null; banned?: boolean | null };
  // 차단 시 세션을 모두 지우므로 보통 여기까지 오지 않지만, 한 번 더 막는다
  if (user.banned) return { status: 'blocked' };
  return { status: 'ok', viewer: { id: user.id, name: user.name, isAdmin: user.role === 'admin' } };
}

// 라우트 핸들러용: 허용되면 Viewer, 아니면 바로 돌려줄 Response(401/403).
export async function requireUser(): Promise<Viewer | Response> {
  const result = await getViewer();
  if (result.status === 'anonymous') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (result.status === 'blocked') return Response.json({ error: 'Blocked' }, { status: 403 });
  return result.viewer;
}

export async function requireAdmin(): Promise<Viewer | Response> {
  const viewer = await requireUser();
  if (viewer instanceof Response) return viewer;
  return viewer.isAdmin ? viewer : Response.json({ error: 'Forbidden' }, { status: 403 });
}
