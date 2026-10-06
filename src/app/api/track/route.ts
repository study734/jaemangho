import { z } from 'zod';
import { parseBody, serverError } from '@/server/http';
import { recordView } from '@/server/analytics';
import { routeKey } from '@/lib/track';
import { requireUser } from '@/server/viewer';

// 화면이 열릴 때 브라우저가 부른다. 관리자 외 로그인한 사용자만, 목록에 있는 화면만 세고, 누가 열었는지는 저장하지 않는다.
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseBody(request, z.object({ path: z.string().max(200) }));
  if (!body.ok) return body.response;
  const key = routeKey(body.data.path);
  if (user.isAdmin || !key) return new Response(null, { status: 204 });
  try {
    await recordView(key);
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}
