import { describe, expect, it, vi } from 'vitest';
import { createAgent } from './agent';
import { AiError, AI_MODEL } from './client';
import { analysisSchema } from './context';

const input = analysisSchema.parse({ context: { topic: 'general' }, question: '함께할 게임 찾아줘' });
const message = { message: { content: '답변', tool_calls: undefined }, model: AI_MODEL, truncated: false };
const call = { message: { content: null, tool_calls: [{ id: 'one', type: 'function' as const, function: { name: 'get_common_games', arguments: '{}' } }] }, model: AI_MODEL, truncated: false };
const result = { status: 'selection_required' as const, message: '멤버를 골라 주세요.' };
const deps = () => ({ generate: vi.fn().mockResolvedValue(message), execute: vi.fn().mockResolvedValue(result),
  acquire: vi.fn().mockResolvedValue('request'), charge: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined), pause: vi.fn().mockResolvedValue(undefined) });

describe('bounded Jaesuni agent', () => {
  it('uses one inference for conversation, sends saved preferences as user data and hides selection references', async () => {
    const d = deps();
    const agent = createAgent(d);
    await expect(agent(input, 'actor', '협동 게임 선호')).resolves.toMatchObject({ answer: '답변' });
    expect(d.generate).toHaveBeenCalledTimes(1);
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.charge).toHaveBeenCalledTimes(1);
    const messages = d.generate.mock.calls[0][0];
    expect(messages[1]).toMatchObject({ role: 'user' });
    expect(messages[1].content).toContain('협동 게임 선호');
    expect(JSON.stringify(messages)).not.toContain('actor');
    expect(d.release).toHaveBeenCalledExactlyOnceWith('request');
  });
  it('executes only one allowed tool then answers without offering more tools', async () => {
    const d = deps(); d.generate.mockResolvedValueOnce(call).mockResolvedValueOnce(message);
    const answer = await createAgent(d)(input, 'actor');
    expect(answer.toolsUsed).toEqual(['Steam 공통 게임 조회 · 선택 필요']);
    expect(d.execute).toHaveBeenCalledExactlyOnceWith('get_common_games', input.selection, expect.any(AbortSignal), 'actor');
    expect(d.generate).toHaveBeenCalledTimes(2);
    expect(d.generate.mock.calls[1][1]).not.toHaveProperty('tools');
    expect(d.generate.mock.calls[1][0].at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'one' });
    expect(d.charge).toHaveBeenCalledTimes(2);
  });
  it('rejects invented tools and arguments before executing anything', async () => {
    for (const [name, args] of [['send_message', '{}'], ['get_common_games', '{"ids":["arbitrary"]}']]) {
      const d = deps(); d.generate.mockResolvedValueOnce({ ...call, message: { ...call.message, tool_calls: [{ ...call.message.tool_calls[0], function: { name, arguments: args } }] } });
      await expect(createAgent(d)(input, 'actor')).rejects.toMatchObject({ status: 502 });
      expect(d.execute).not.toHaveBeenCalled(); expect(d.release).toHaveBeenCalled();
    }
  });
  it('keeps lookup failure explicit and never forwards raw upstream errors to the model', async () => {
    const d = deps(); d.generate.mockResolvedValueOnce(call).mockResolvedValueOnce(message);
    d.execute.mockRejectedValueOnce(new Error('private-token-and-nickname'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const answer = await createAgent(d)(input, 'actor');
      expect(answer.toolsUsed?.[0]).toContain('조회 실패');
      const toolMessage = d.generate.mock.calls[1][0].at(-1);
      expect(toolMessage.content).toContain('unavailable');
      expect(toolMessage.content).not.toContain('private-');
    } finally { log.mockRestore(); }
  });
  it('respects admission and per-call budgets, and pauses after provider 429 without retry', async () => {
    const d = deps(); d.charge.mockRejectedValueOnce(new AiError('busy', 429, 'budget'));
    await expect(createAgent(d)(input, 'actor')).rejects.toMatchObject({ status: 429 });
    expect(d.generate).not.toHaveBeenCalled(); expect(d.pause).not.toHaveBeenCalled(); expect(d.release).toHaveBeenCalled();
    d.charge.mockResolvedValue(undefined); d.generate.mockRejectedValueOnce(new AiError('upstream', 429, 'quota', 429));
    await expect(createAgent(d)(input, 'actor')).rejects.toMatchObject({ status: 429 });
    expect(d.pause).toHaveBeenCalledTimes(1); expect(d.generate).toHaveBeenCalledTimes(1);
  });
  it('bounds the whole turn and ignores slow tool results without another inference', async () => {
    const d = deps(); d.generate.mockResolvedValueOnce(call);
    let finish!: (value: typeof result) => void;
    d.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await expect(createAgent(d, 10)(input, 'actor')).rejects.toMatchObject({ status: 504 });
    finish(result);
    await Promise.resolve(); await Promise.resolve();
    expect(d.generate).toHaveBeenCalledTimes(1); expect(d.release).toHaveBeenCalled();
  });
  it('does not charge or call the provider after admission exceeds the deadline', async () => {
    const d = deps();
    d.acquire.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('request'), 20)));
    await expect(createAgent(d, 5)(input, 'actor')).rejects.toMatchObject({ status: 504 });
    expect(d.charge).not.toHaveBeenCalled(); expect(d.generate).not.toHaveBeenCalled();
    expect(d.release).toHaveBeenCalledExactlyOnceWith('request');
  });
});
