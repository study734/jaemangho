export interface AnalysisResult { answer: string; model: string; truncated: boolean }
export type AnalysisRequest = (context: Record<string, unknown>, question: string, signal: AbortSignal, history?: HistoryMessage[]) => Promise<AnalysisResult>;

export const requestAnalysis: AnalysisRequest = async (context, question, signal, history = []) => {
  const timeout = AbortSignal.timeout(35_000);
  let response: Response;
  try {
    response = await fetch('/api/ai', { method: 'POST', signal: AbortSignal.any([signal, timeout]), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, question, history }) });
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

export interface Attachment { context: Record<string, unknown>; capturedAt: string }
export interface ChatMessage { role: 'user' | 'assistant'; content: string; attachment?: Attachment; truncated?: boolean }
export type HistoryMessage = { role: 'user'; content: string; context: Record<string, unknown> } | { role: 'assistant'; content: string };

// Send whole completed turns only. Bound provider context independently of the
// visible timeline; old attachments stay associated with their original turn.
export function conversationHistory(messages: ChatMessage[]): HistoryMessage[] {
  let history: HistoryMessage[] = [];
  for (let i = messages.length - 2; i >= 0 && history.length < 8; i -= 2) {
    const [user, assistant] = messages.slice(i, i + 2);
    if (user.role !== 'user' || assistant.role !== 'assistant') break;
    const pair: HistoryMessage[] = [
      { role: 'user', content: user.content, context: user.attachment?.context ?? { topic: 'general' } },
      { role: 'assistant', content: assistant.content },
    ];
    if (JSON.stringify([...pair, ...history]).length > 24000) break;
    history = [...pair, ...history];
  }
  return history;
}

export function createChatModel(request = requestAnalysis) {
  const initial = { busy: false, messages: [] as ChatMessage[], attachment: null as Attachment | null, error: '', draft: '' };
  let snapshot = initial;
  let revision = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (change: Partial<typeof initial>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); };
  async function send(question: string, retry = false) {
    const content = question.trim();
    if (snapshot.busy || !content || content.length > 600) return;
    const previous = retry ? snapshot.messages.slice(0, -1) : snapshot.messages;
    const user: ChatMessage = retry ? snapshot.messages.at(-1)! : { role: 'user', content, ...(snapshot.attachment ? { attachment: snapshot.attachment } : {}) };
    const version = ++revision;
    controller = new AbortController();
    update({ busy: true, error: '', draft: '', messages: [...previous, user] });
    try {
      const result = await request(user.attachment?.context ?? { topic: 'general' }, content, controller.signal, conversationHistory(previous));
      if (version === revision) update({ messages: [...previous, user, { role: 'assistant', content: result.answer, truncated: result.truncated }] });
    } catch (error) {
      if (version === revision) update({ error: error instanceof Error ? error.message : 'AI 서버에 연결하지 못했어요.' });
    } finally { if (version === revision) update({ busy: false }); }
  }
  return {
    getSnapshot: () => snapshot, getServerSnapshot: () => initial,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setDraft(draft: string) { update({ draft }); },
    attach(context: Record<string, unknown>) {
      update({ attachment: { context: structuredClone(context), capturedAt: new Date().toISOString() } });
    },
    detach() { update({ attachment: null }); },
    send(question = snapshot.draft) { if (!snapshot.error) return send(question); },
    retry() { if (snapshot.error) return send(snapshot.messages.at(-1)!.content, true); },
    editFailed() {
      if (!snapshot.error || snapshot.busy) return;
      const failed = snapshot.messages.at(-1)!;
      update({ messages: snapshot.messages.slice(0, -1), draft: failed.content, attachment: failed.attachment ?? null, error: '' });
    },
    reset() { revision++; controller?.abort(); update(initial); },
    cancel() { revision++; controller?.abort(); update({ busy: false }); },
  };
}
