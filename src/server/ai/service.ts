import { createHash } from 'node:crypto';
import { AiError, complete } from './client';
import { runAgent } from './agent';
import { readPreference } from './store';
import type { AgentAnswer } from './agent';
import type { AnalysisInput } from './context';

type Answer = AgentAnswer;
// Opportunistic limits/cache per server instance, not a cross-instance quota.
// There is no queue and no automatic retry that could multiply paid requests.
export function createAnalysisService(
  generate: (input: AnalysisInput, userId: string, preference: string) => Promise<Answer> = input => complete(input),
  now = Date.now, getPreference: (userId: string) => Promise<string> = async () => '',
) {
  const active = new Map<string, { key: string; task: Promise<Answer> }>();
  const attempts = new Map<string, number[]>();
  const cache = new Map<string, { until: number; result: Answer }>();
  return async (userId: string, input: AnalysisInput): Promise<Answer> => {
    const preference = await getPreference(userId);
    const at = now();
    for (const [key, entry] of cache) if (entry.until <= at) cache.delete(key);
    for (const [id, times] of attempts) if (times.every(time => time <= at - 60_000)) attempts.delete(id);
    const key = createHash('sha256').update(JSON.stringify([userId, input, preference])).digest('hex');
    const pending = active.get(userId);
    if (pending?.key === key) return pending.task;
    const cached = cache.get(key);
    if (cached) return cached.result;
    const times = (attempts.get(userId) ?? []).filter(time => time > at - 60_000);
    if (pending || active.size >= 4 || times.length >= 6 || (!attempts.has(userId) && attempts.size >= 1000))
      throw new AiError('busy', 429, 'AI 요청이 많아요. 잠시 후 다시 시도해 주세요.');
    attempts.set(userId, [...times, at]);
    const task = Promise.resolve().then(() => generate(input, userId, preference)).then(result => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { result, until: now() + 300_000 });
      return result;
    }).finally(() => { active.delete(userId); });
    active.set(userId, { key, task });
    return task;
  };
}

const coordinatedAgent = createAnalysisService(runAgent, Date.now, readPreference);
export async function analyze(userId: string, input: AnalysisInput) {
  // Preserve configuration errors without starting DB quota work or provider calls.
  if (!process.env.NVIDIA_API_KEY?.trim() || ['$NVIDIA_API_KEY', 'NVIDIA_API_KEY'].includes(process.env.NVIDIA_API_KEY.trim()))
    throw new AiError('not_configured', 503, 'AI 연결이 준비되지 않았어요. 서버의 NVIDIA_API_KEY 설정을 확인해 주세요.');
  return coordinatedAgent(userId, input);
}
