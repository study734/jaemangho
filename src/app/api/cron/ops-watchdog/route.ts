import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { sendWeeklySummary } from '@/server/operations/weekly-summary';
import { reportFailure } from '@/server/diagnostics';
import { runScheduledSteamCollection } from '@/server/activity/steam-collection';
import { postAnnouncements } from '@/server/chat/announce';
import { serverError } from '@/server/http';

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeMonitor(request.headers.get('authorization'));
  if (auth === 'unconfigured') return Response.json({ error: 'Not configured' }, { status: 503 });
  if (auth !== 'ok') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await checkOperations('watchdog');
    // 주간 요약 실패는 점검 결과와 분리한다(다음 날 다시 시도된다).
    const weeklySummary = await sendWeeklySummary().catch((error: unknown) => {
      reportFailure('ops.weekly-summary', error);
      return 'failed' as const;
    });
    // 재순이 자동 공지(intent/0004): 한 실행에 메시지 하나, 실패는 점검 결과와 분리한다.
    const announcement = await postAnnouncements({ token: process.env.DISCORD_BOT_TOKEN }).then(r => r.status).catch((error: unknown) => {
      reportFailure('chat.announce', error);
      return 'failed' as const;
    });
    const steamActivity = await runScheduledSteamCollection();
    return Response.json({ ...result, weeklySummary, announcement, steamActivity });
  } catch (error) { return serverError(error, 'api/cron/ops-watchdog.GET'); }
}
