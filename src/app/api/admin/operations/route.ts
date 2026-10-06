import { requireAdmin } from '@/server/viewer';
import { parseQuery, serverError } from '@/server/http';
import { viewReport, viewReportSchema } from '@/server/analytics';
import { audited } from '@/server/operations/audit';
import { runChatSync, SyncBusyError, SyncUnconfiguredError } from '@/server/operations/jobs';
import { checkOperations } from '@/server/operations/monitor';
import { operationSnapshot, operationStatus } from '@/server/operations/status';
import { purgeSteamCache } from '@/server/steam/cache';
import { z } from 'zod';

export const maxDuration = 60;
const commandSchema = z.object({ action: z.enum(['sync', 'check', 'purge-steam']) });

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const params = new URL(request.url).searchParams;
  try {
    if (params.get('resource') === 'views') {
      const query = parseQuery(params, viewReportSchema);
      if (!query.ok) return query.response;
      return Response.json(await viewReport(query.data.days, query.data.end));
    }
    if (params.get('resource') === 'export') {
      const data = await audited(admin, 'snapshot.export', 'operations', operationSnapshot);
      return Response.json(data, { headers: { 'Content-Disposition': 'attachment; filename="jaemangho-operations.json"', 'Cache-Control': 'no-store' } });
    }
    if (params.get('resource') && params.get('resource') !== 'status') return Response.json({ error: 'Unknown resource' }, { status: 404 });
    return Response.json(await operationStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return serverError(error); }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const query = parseQuery(new URL(request.url).searchParams, commandSchema);
  if (!query.ok) return query.response;
  try {
    switch (query.data.action) {
      case 'sync': return Response.json(await audited(admin, 'chat.sync', 'chat', () => runChatSync('manual')));
      case 'check': return Response.json(await audited(admin, 'monitor.check', 'operations', checkOperations));
      case 'purge-steam': return Response.json(await audited(admin, 'cache.steam.purge', 'steam', purgeSteamCache));
    }
  } catch (error) {
    if (error instanceof SyncBusyError) return Response.json({ error: '동기화가 이미 실행 중입니다.' }, { status: 409 });
    if (error instanceof SyncUnconfiguredError) return Response.json({ error: 'Discord 봇 설정이 필요합니다.' }, { status: 503 });
    return serverError(error);
  }
}
