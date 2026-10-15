export interface AnalysisResult { answer: string; model: string; truncated: boolean }
export type AnalysisRequest = (context: Record<string, unknown>, question: string, signal: AbortSignal) => Promise<AnalysisResult>;

export const requestAnalysis: AnalysisRequest = async (context, question, signal) => {
  const timeout = AbortSignal.timeout(35_000);
  let response: Response;
  try {
    response = await fetch('/api/ai', { method: 'POST', signal: AbortSignal.any([signal, timeout]), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, question }) });
  } catch {
    throw new Error(timeout.aborted ? 'AI 요청 시간이 길어졌어요. 다시 시도해 주세요.' : 'AI 서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const id = response.headers.get('X-Request-ID');
    throw new Error(`${typeof body?.error === 'string' ? body.error.slice(0, 300) : 'AI 요청에 실패했어요.'}${id && /^[\da-f-]{36}$/i.test(id) ? ` 오류 ID: ${id}` : ''}`);
  }
  if (!body || typeof body.answer !== 'string' || !body.answer.trim() || typeof body.model !== 'string' || typeof body.truncated !== 'boolean')
    throw new Error('AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  return body;
};

export function createAnalysisModel(context: Record<string, unknown>, request = requestAnalysis) {
  const initial = { busy: false, result: null as AnalysisResult | null, error: '' };
  let snapshot = initial;
  let revision = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (change: Partial<typeof initial>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => snapshot, getServerSnapshot: () => initial,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async run(question = '') {
      if (snapshot.busy) return;
      const version = ++revision;
      controller = new AbortController();
      update({ busy: true, result: null, error: '' });
      try {
        const result = await request(context, question.trim(), controller.signal);
        if (version === revision) update({ result });
      } catch (error) {
        if (version === revision) update({ error: error instanceof Error ? error.message : 'AI 서버에 연결하지 못했어요.' });
      } finally { if (version === revision) update({ busy: false }); }
    },
    cancel() { revision++; controller?.abort(); update({ busy: false }); },
  };
}
