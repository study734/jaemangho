import { requireAdmin } from '@/server/viewer';
import { AiError, messagesFor, requestModel, type ModelMessage } from '@/server/ai/client';
import { toolDefinitions } from '@/server/ai/tools';
import { analysisSchema } from '@/server/ai/context';

export const maxDuration = 60;

// Admin-only timing probe for the NVIDIA call as it really runs on this deployment.
// Only timings and error codes are returned: no prompt, answer or key.
async function probe(name: string, messages: ModelMessage[], tools?: typeof toolDefinitions) {
  const started = Date.now();
  let headersMs: number | null = null;
  try {
    await requestModel(messages, { timeoutMs: 40_000, tools, onStage: () => { headersMs = Date.now() - started; } });
    return { name, ok: true, headersMs, totalMs: Date.now() - started };
  } catch (error) {
    const known = error instanceof AiError;
    return { name, ok: false, headersMs, totalMs: Date.now() - started, code: known ? error.code : 'unexpected', status: known ? error.status : undefined };
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const full = messagesFor(analysisSchema.parse({ context: { topic: 'general' }, question: '재순이는 뭘 도와줘?' }));
  // Sequential on purpose: two parallel calls could slow each other and blur the result.
  const results = [
    await probe('minimal', [{ role: 'user', content: '안녕' }]),
    await probe('full-with-tools', full, toolDefinitions),
  ];
  return Response.json({ region: process.env.VERCEL_REGION ?? null, runtime: process.version, results }, { headers: { 'Cache-Control': 'no-store' } });
}
