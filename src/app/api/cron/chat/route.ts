import { serverError } from '@/server/http';
import { authorizeCron } from '@/server/chat/cron';
import { runChatSync, SyncBusyError } from '@/server/operations/jobs';

export const maxDuration = 60;

// 하루 한 번 Vercel 크론이 부른다(vercel.json). 로그인 세션이 아니라 CRON_SECRET으로 보호한다.
// 비밀값이 설정돼 있지 않으면 누구도 호출할 수 없다. 응답에는 개수만 담는다.
export async function GET(request: Request) {
  const auth = authorizeCron(request.headers.get('authorization'));
  if (auth.status === 'unconfigured') return Response.json({ error: 'Not configured' }, { status: 503 });
  if (auth.status === 'unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return Response.json(await runChatSync('scheduled', { token: auth.config.token, guildId: auth.config.guildId, laugh: process.env.CHAT_LAUGH === '1' }));
  } catch (e) {
    if (e instanceof SyncBusyError) return Response.json({ error: '동기화가 이미 실행 중입니다.' }, { status: 409 });
    return serverError(e);
  }
}
