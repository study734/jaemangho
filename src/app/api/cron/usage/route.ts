import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { recordUsage, usageReportSchema } from '@/server/operations/usage';
import { parseBody, serverError } from '@/server/http';

export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = authorizeMonitor(request.headers.get('authorization'));
  if (auth === 'unconfigured') return Response.json({ error: 'Not configured' }, { status: 503 });
  if (auth !== 'ok') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const report = await parseBody(request, usageReportSchema);
  if (!report.ok) return report.response;
  if (Math.abs(Date.now() - Date.parse(report.data.at)) > 10 * 60_000) return Response.json({ error: 'Invalid report' }, { status: 400 });
  try {
    const budget = await recordUsage(report.data);
    await checkOperations('watchdog');
    return Response.json({ mode: budget.mode }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return serverError(error, 'api/cron/usage.POST'); }
}
