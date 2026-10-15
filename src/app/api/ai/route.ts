import { requireUser } from '@/server/viewer';
import { serverError } from '@/server/http';
import { reportFailure } from '@/server/diagnostics';
import { parseAnalysis } from '@/server/ai/input';
import { AiError } from '@/server/ai/client';
import { analyze } from '@/server/ai/service';

export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const input = await parseAnalysis(request);
  if (!input.ok) return input.response;
  try {
    return Response.json(await analyze(user.id, input.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof AiError)) return serverError(error, 'api/ai.POST');
    const requestId = reportFailure('api/ai.POST', error);
    return Response.json({ error: error.message, requestId }, { status: error.status,
      headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store', ...(error.status === 429 ? { 'Retry-After': '60' } : {}) } });
  }
}
