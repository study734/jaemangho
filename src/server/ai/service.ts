import { createHash } from 'node:crypto';
import { AiError, NOT_CONFIGURED_MESSAGE, aiKeyConfigured, complete } from './client';
import { runAgent } from './agent';
import { readPreference } from './store';
import type { AgentAnswer } from './agent';
import type { AnalysisInput } from './context';
import { withinDeadline } from './deadline';

type Answer = AgentAnswer;
// Opportunistic limits/cache per server instance, not a cross-instance quota.
// There is no queue and no automatic retry that could multiply paid requests.
export function createAnalysisService(
  generate: (input: AnalysisInput, userId: string, preference: string, signal?: AbortSignal) => Promise<Answer> = (input, _userId, _preference, signal) => complete(input, { signal }),
  now = Date.now, getPreference: (userId: string, signal?: AbortSignal) => Promise<string> = async () => '', budgetMs = 25_000,
) {
  const active = new Map<string, { key: string; task: Promise<Answer> }>();
  const attempts = new Map<string, number[]>();
  const cache = new Map<string, { until: number; result: Answer }>();
  return async (userId: string, input: AnalysisInput): Promise<Answer> => {
    const startedAt = Date.now();
    const signal = AbortSignal.timeout(budgetMs);
    const preference = await withinDeadline(getPreference(userId, signal), signal, () => ({ phase: 'preference', elapsedMs: Date.now() - startedAt }));
    const at = now();
    for (const [key, entry] of cache) if (entry.until <= at) cache.delete(key);
    for (const [id, times] of attempts) if (times.every(time => time <= at - 60_000)) attempts.delete(id);
    const key = createHash('sha256').update(JSON.stringify([userId, input, preference])).digest('hex');
    const pending = active.get(userId);
    if (pending?.key === key) return pending.task;
    // Steam tools depend on current shared game tastes. Reusing an old answer
    // after a save/withdrawal would hide that change. In-flight dedup remains.
    const cacheable = input.selection.steam.length === 0;
    const cached = cacheable ? cache.get(key) : undefined;
    if (cached) return cached.result;
    const times = (attempts.get(userId) ?? []).filter(time => time > at - 60_000);
    if (pending || active.size >= 4 || times.length >= 6 || (!attempts.has(userId) && attempts.size >= 1000))
      throw new AiError('busy', 429, 'AI 요청이 많아요. 잠시 후 다시 시도해 주세요.');
    attempts.set(userId, [...times, at]);
    const task = Promise.resolve().then(() => generate(input, userId, preference, signal)).then(result => {
      if (cacheable) {
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(key, { result, until: now() + 300_000 });
      }
      return result;
    }).finally(() => { active.delete(userId); });
    active.set(userId, { key, task });
    return task;
  };
}

const coordinatedAgent = createAnalysisService(runAgent, Date.now, readPreference);
export async function analyze(userId: string, input: AnalysisInput) {
  // Preserve configuration errors without starting DB quota work or provider calls.
  if (!aiKeyConfigured()) throw new AiError('not_configured', 503, NOT_CONFIGURED_MESSAGE);
  return coordinatedAgent(userId, input);
}
