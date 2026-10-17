import { describe, expect, it, vi } from 'vitest';
import { createAnalysisService } from './service';
import type { AnalysisInput } from './context';

const input: AnalysisInput = { context: { topic: 'general' }, question: '', history: [], selection: { steam: [], lol: null } };
const result = { answer: '답변', model: 'test', truncated: false };
describe('analysis request coordination', () => {
  it('shares identical in-flight calls, separates users and expires cached answers', async () => {
    let time = 0;
    let finish!: (value: typeof result) => void;
    const generate = vi.fn(() => new Promise<typeof result>(resolve => { finish = resolve; }));
    const analyze = createAnalysisService(generate, () => time);
    const first = analyze('one', input);
    const duplicate = analyze('one', input);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await expect(analyze('one', { ...input, question: '다른 질문' })).rejects.toMatchObject({ status: 429 });
    finish(result);
    await expect(first).resolves.toEqual(result);
    await expect(duplicate).resolves.toEqual(result);
    await expect(analyze('one', input)).resolves.toEqual(result);
    generate.mockImplementation(async () => result);
    await analyze('two', input);
    expect(generate).toHaveBeenCalledTimes(2);
    time = 300_001;
    await analyze('one', input);
    expect(generate).toHaveBeenCalledTimes(3);
  });
  it('releases failed requests, allows retry and limits repeated attempts', async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error('failure')).mockResolvedValue(result);
    const analyze = createAnalysisService(generate, () => 0);
    await expect(analyze('one', input)).rejects.toThrow('failure');
    await expect(analyze('one', input)).resolves.toEqual(result);
    for (let i = 0; i < 4; i++) await analyze('one', { ...input, question: String(i) });
    await expect(analyze('one', { ...input, question: 'over limit' })).rejects.toMatchObject({ status: 429 });
    // Reading the same cached answer consumes no provider attempt.
    await expect(analyze('one', input)).resolves.toEqual(result);
  });
  it('includes conversation history in the user-scoped cache key', async () => {
    const generate = vi.fn(async () => result);
    const analyze = createAnalysisService(generate, () => 0);
    await analyze('one', input);
    await analyze('one', { ...input, history: [
      { role: 'user', content: '앞선 질문', context: { topic: 'general' } },
      { role: 'assistant', content: '앞선 답변' },
    ] });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('invalidates answer reuse when the explicitly stored preference changes', async () => {
    let note = '협동';
    const generate = vi.fn(async () => result);
    const analyze = createAnalysisService(generate, () => 0, async () => note);
    await analyze('one', input);
    note = '경쟁';
    await analyze('one', input);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenLastCalledWith(input, 'one', '경쟁', expect.any(AbortSignal));
  });
  it('bounds global in-flight work without introducing a queue', async () => {
    const generate = vi.fn(() => new Promise<typeof result>(() => {}));
    const analyze = createAnalysisService(generate);
    for (let i = 0; i < 4; i++) void analyze(String(i), input);
    await expect(analyze('fifth', input)).rejects.toMatchObject({ status: 429 });
  });
  it('refreshes Steam tool answers so a game taste save or sharing withdrawal takes effect', async () => {
    const generate = vi.fn(async () => result);
    const analyze = createAnalysisService(generate, () => 0);
    const selected = { ...input, selection: { steam: ['s_' + 'a'.repeat(24)], lol: null } };
    await analyze('one', selected); await analyze('one', selected);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('bounds preference reads before starting model or quota work', async () => {
    const generate = vi.fn(async () => result);
    const analyze = createAnalysisService(generate, Date.now, () => new Promise(() => {}), 15);
    const outcome = await Promise.race([
      analyze('one', input).catch(error => error),
      new Promise(resolve => setTimeout(() => resolve('still waiting'), 100)),
    ]);
    expect(outcome).toMatchObject({ code: 'timeout', phase: 'preference' });
    expect(generate).not.toHaveBeenCalled();
  });
});
