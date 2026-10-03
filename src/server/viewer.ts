import { cookies } from 'next/headers';
import { SESSION_COOKIE, readToken } from './session';
import { getUser } from './users';

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

  const session = readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { status: 'anonymous' };

  const user = await getUser(session.id);
  if (user?.blocked) return { status: 'blocked' };
  return { status: 'ok', viewer: { id: session.id, name: session.name, isAdmin: user?.is_admin === true } };
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
