import { serverError } from '@/server/http';
import { authorizeCron } from '@/server/chat/cron';
import { runSubgameFeedFromEnv } from '@/server/subgame/feed';

export const maxDuration = 60;

// 수동 실행·확인용. 매일 자동 실행은 /api/cron/chat이 이어서 부른다. 응답에는 개수와 게임 이름만 담는다.
export async function GET(request: Request) {
  const auth = authorizeCron(request.headers.get('authorization'));
  if (auth.status === 'unconfigured') return Response.json({ error: 'Not configured' }, { status: 503 });
  if (auth.status === 'unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json(await runSubgameFeedFromEnv(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return serverError(error, 'api/cron/subgame.GET'); }
}
