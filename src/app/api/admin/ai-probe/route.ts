import { requireAdmin } from '@/server/viewer';

export const maxDuration = 60;

// Admin-only timing probe for NVIDIA as it really runs on this deployment. Calls are
// sequential and capped so the response always arrives before maxDuration (4 x 11s). `at` lets a
// run be compared with a local probe at the same moment: provider latency drifts over time.
// Only timings and HTTP statuses are returned: no prompt, answer or key.
const BASE = 'https://integrate.api.nvidia.com/v1';
const chat = (model: string, extra: object = {}) => ({ method: 'POST', body: JSON.stringify({ model, max_tokens: 64, stream: false, messages: [{ role: 'user', content: '안녕' }], ...extra }) });

async function probe(name: string, path: string, key: string, init: RequestInit = {}) {
  const started = Date.now(), at = new Date(started).toISOString();
  try {
    const response = await fetch(`${BASE}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(11_000), ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
    const headersMs = Date.now() - started;
    await response.arrayBuffer();
    return { name, at, status: response.status, headersMs, totalMs: Date.now() - started };
  } catch (error) {
    return { name, at, status: null, error: error instanceof Error ? error.name : 'unknown', totalMs: Date.now() - started };
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const key = process.env.NVIDIA_API_KEY?.trim() ?? '';
  if (!key) return Response.json({ error: 'NVIDIA_API_KEY is not set' }, { status: 503 });
  const glm = chat('z-ai/glm-5.3-flash', { reasoning_effort: 'low' });
  const results = [
    await probe('GET /models (authenticated)', '/models', key),
    await probe('chat glm-5.3-flash, minimal #1', '/chat/completions', key, glm),
    await probe('chat glm-5.3-flash, minimal #2', '/chat/completions', key, glm),
    await probe('chat glm-5.3-flash, minimal #3', '/chat/completions', key, glm),
  ];
  return Response.json({ region: process.env.VERCEL_REGION ?? null, runtime: process.version, results }, { headers: { 'Cache-Control': 'no-store' } });
}
