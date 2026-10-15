import { describe, expect, it, vi } from 'vitest';
import { conversationHistory, createChatModel, requestAnalysis, type AnalysisResult } from './model';
const answer: AnalysisResult = { answer: '설명', model: 'test', truncated: false };
describe('personal chat state', () => {
  it('sends completed turns and preserves snapshot ownership across attachment changes', async () => {
    const request = vi.fn().mockResolvedValue(answer);
    const model = createChatModel(request);
    const original = { topic: 'steam', people: 4 };
    model.attach(original);
    original.people = 8;
    await model.send('게임 골라줘');
    model.attach({ topic: 'lol', players: [] });
    await model.send('이 기록도 봐줘');
    expect(request.mock.calls[1][3]).toEqual([
      { role: 'user', content: '게임 골라줘', context: { topic: 'steam', people: 4 } },
      { role: 'assistant', content: '설명' },
    ]);
    expect(request.mock.calls[1][0]).toEqual({ topic: 'lol', players: [] });
    expect(model.getSnapshot().messages).toHaveLength(4);
    model.detach();
    await model.send('일반 질문');
    expect(request.mock.calls[2][0]).toEqual({ topic: 'general' });
  });
  it('blocks duplicate requests and ignores late results after reset', async () => {
    let finish!: (value: AnalysisResult) => void;
    const request = vi.fn(() => new Promise<AnalysisResult>(resolve => { finish = resolve; }));
    const model = createChatModel(request);
    const task = model.send('질문');
    await model.send('중복');
    expect(request).toHaveBeenCalledTimes(1);
    model.reset();
    finish(answer);
    await task;
    expect(model.getSnapshot()).toMatchObject({ busy: false, messages: [], attachment: null, error: '' });
  });
  it('retries the original turn without duplicate messages even if attachment changed', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('연결 실패')).mockResolvedValue(answer);
    const model = createChatModel(request);
    model.attach({ topic: 'steam' });
    await model.send('질문');
    model.attach({ topic: 'lol' });
    await model.send('다른 질문');
    expect(request).toHaveBeenCalledTimes(1);
    await model.retry();
    expect(request.mock.calls[1][0]).toEqual({ topic: 'steam' });
    expect(model.getSnapshot()).toMatchObject({ error: '', busy: false });
    expect(model.getSnapshot().messages).toHaveLength(2);
  });
  it('allows editing a failed question without losing earlier completed turns', async () => {
    const request = vi.fn().mockResolvedValueOnce(answer).mockRejectedValueOnce(new Error('실패')).mockResolvedValue(answer);
    const model = createChatModel(request);
    await model.send('첫 질문');
    await model.send('고칠 질문');
    model.editFailed();
    expect(model.getSnapshot()).toMatchObject({ draft: '고칠 질문', error: '' });
    expect(model.getSnapshot().messages).toHaveLength(2);
    await model.send('고친 질문');
    expect(request.mock.calls[2][1]).toBe('고친 질문');
    expect(request.mock.calls[2][3]).toHaveLength(2);
  });
  it('bounds history by complete turns and total serialized size', async () => {
    const model = createChatModel(async () => answer);
    for (let i = 0; i < 6; i++) await model.send(String(i));
    const history = conversationHistory(model.getSnapshot().messages);
    expect(history).toHaveLength(8);
    expect(history[0].content).toBe('2');
    expect(conversationHistory([{ role: 'user', content: '질문' }, { role: 'assistant', content: 'x'.repeat(24000) }])).toEqual([]);
  });
  it('retains safe error IDs from the API', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: '한도 도달' }, { status: 429, headers: { 'X-Request-ID': id } })));
    try { await expect(requestAnalysis({}, '', new AbortController().signal)).rejects.toThrow(`오류 ID: ${id}`); }
    finally { vi.unstubAllGlobals(); }
  });
});
