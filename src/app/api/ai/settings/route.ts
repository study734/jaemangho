import { requireUser } from '@/server/viewer';
import { serverError } from '@/server/http';
import { parsePreference } from '@/server/ai/input';
import { memberChoices } from '@/server/ai/tools';
import { readPreference, savePreference } from '@/server/ai/store';
import { AiError } from '@/server/ai/client';

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const [choices, note] = await Promise.all([memberChoices(), readPreference(user.id)]);
    return Response.json({ ...choices, note }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return serverError(error, 'ai.settings.get'); }
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const input = await parsePreference(request);
  if (!input.ok) return input.response;
  try {
    await savePreference(user.id, input.data.note);
    return Response.json({ note: input.data.note }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.status });
    return serverError(error, 'ai.settings.put');
  }
}
