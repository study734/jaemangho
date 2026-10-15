import { describe, expect, it, vi } from 'vitest';
import { createAnalysisModel, requestAnalysis, type AnalysisResult } from './model';
const answer: AnalysisResult = { answer: '설명', model: 'test', truncated: false };
describe('analysis UI state', () => {
  it('blocks duplicate requests and ignores late results after context disposal', async () => {
    let finish!: (value: AnalysisResult) => void;
    const request = vi.fn(() => new Promise<AnalysisResult>(resolve => { finish = resolve; }));
    const model = createAnalysisModel({ topic: 'general' }, request);
    const task = model.run('질문');
    await model.run('중복');
    expect(request).toHaveBeenCalledTimes(1);
    model.cancel();
    finish(answer);
    await task;
    expect(model.getSnapshot()).toMatchObject({ busy: false, result: null });
  });
  it('keeps failure separate from an empty answer and permits retry', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('연결 실패')).mockResolvedValue(answer);
    const model = createAnalysisModel({ topic: 'general' }, request);
    await model.run();
    expect(model.getSnapshot()).toMatchObject({ error: '연결 실패', result: null, busy: false });
    await model.run();
    expect(model.getSnapshot()).toMatchObject({ error: '', result: answer });
  });
  it('retains safe error IDs from the API', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: '한도 도달' }, { status: 429, headers: { 'X-Request-ID': id } })));
    try { await expect(requestAnalysis({}, '', new AbortController().signal)).rejects.toThrow(`오류 ID: ${id}`); }
    finally { vi.unstubAllGlobals(); }
  });
});
