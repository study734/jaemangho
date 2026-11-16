import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { sendWeeklySummary } from '@/server/operations/weekly-summary';
import { reportFailure } from '@/server/diagnostics';
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
    return Response.json({ ...result, weeklySummary });
  } catch (error) { return serverError(error, 'api/cron/ops-watchdog.GET'); }
}
