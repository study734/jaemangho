import { authorizeMonitor, checkOperations } from '@/server/operations/monitor';
import { serverError } from '@/server/http';
import { resumePendingChat } from '@/server/operations/jobs';

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeMonitor(request.headers.get('authorization'));
  if (auth === 'unconfigured') return Response.json({ error: 'Not configured' }, { status: 503 });
  if (auth !== 'ok') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const chatRecovery = await resumePendingChat();
    return Response.json({ ...await checkOperations('external'), chatRecovery });
  } catch (error) { return serverError(error); }
}
