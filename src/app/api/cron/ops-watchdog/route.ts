import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { sendWeeklySummary } from '@/server/operations/weekly-summary';
import { reportFailure } from '@/server/diagnostics';
import { runSteamCollection, SteamCollectionBudgetError, SteamCollectionBusyError } from '@/server/activity/steam-collection';
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
    const steamActivity = await scheduledSteamCollection();
    return Response.json({ ...result, weeklySummary, steamActivity });
  } catch (error) { return serverError(error, 'api/cron/ops-watchdog.GET'); }
}

// Steam 예약 수집(intent/0001). 점검이 DB를 쓴 뒤에만 돌아 Neon을 새로 깨우지 않는다.
// 점검·요약과 합쳐 maxDuration 60초 안에 끝나도록 25초 예산이며, 남은 계정은 다음 날 이어서 한다.
// 실패·거부는 점검 응답을 바꾸지 않고, 응답에는 상태와 개수만 담는다.
async function scheduledSteamCollection() {
  try {
    const run = await runSteamCollection('scheduled', { budgetMs: 25_000 });
    return { status: run.status, eligible: run.eligible, collected: run.collected, unavailable: run.unavailable,
      failed: run.failed, changes: run.changes, deferred: run.deferred };
  } catch (error) {
    if (error instanceof SteamCollectionBudgetError) return 'budget' as const;
    if (error instanceof SteamCollectionBusyError) return 'busy' as const;
    reportFailure('steam.activity.scheduled', error);
    return 'failed' as const;
  }
}
