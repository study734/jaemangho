import { createHash } from 'node:crypto';
import { AiError, complete } from './client';
import type { AnalysisInput } from './context';

type Answer = Awaited<ReturnType<typeof complete>>;
// Opportunistic limits/cache per server instance, not a cross-instance quota.
// There is no queue and no automatic retry that could multiply paid requests.
export function createAnalysisService(generate = complete, now = Date.now) {
  const active = new Map<string, { key: string; task: Promise<Answer> }>();
  const attempts = new Map<string, number[]>();
  const cache = new Map<string, { until: number; result: Answer }>();
  return async (userId: string, input: AnalysisInput): Promise<Answer> => {
    const at = now();
    for (const [key, entry] of cache) if (entry.until <= at) cache.delete(key);
    for (const [id, times] of attempts) if (times.every(time => time <= at - 60_000)) attempts.delete(id);
    const key = createHash('sha256').update(JSON.stringify([userId, input])).digest('hex');
    const pending = active.get(userId);
    if (pending?.key === key) return pending.task;
    const cached = cache.get(key);
    if (cached) return cached.result;
    const times = (attempts.get(userId) ?? []).filter(time => time > at - 60_000);
    if (pending || active.size >= 4 || times.length >= 6 || (!attempts.has(userId) && attempts.size >= 1000))
      throw new AiError('busy', 429, 'AI 요청이 많아요. 잠시 후 다시 시도해 주세요.');
    attempts.set(userId, [...times, at]);
    const task = Promise.resolve().then(() => generate(input)).then(result => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { result, until: now() + 300_000 });
      return result;
    }).finally(() => { active.delete(userId); });
    active.set(userId, { key, task });
    return task;
  };
}

export const analyze = createAnalysisService();
