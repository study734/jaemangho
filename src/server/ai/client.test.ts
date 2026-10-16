import { describe, expect, it, vi } from 'vitest';
import { complete, requestModel, messagesFor, AI_MODEL } from './client';
import { analysisSchema } from './context';

const input = analysisSchema.parse({ context: { topic: 'general' } });
const success = () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '  설명입니다.  ' } }] });
describe('NVIDIA client', () => {
  it('uses the fixed server endpoint and never includes the key in the prompt', async () => {
    const transport = vi.fn(async () => success());
    await expect(complete(input, { apiKey: 'private-key', fetch: transport })).resolves.toEqual({ answer: '설명입니다.', model: AI_MODEL, truncated: false });
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(init.headers).toHaveProperty('Authorization', 'Bearer private-key');
    expect(init.body).not.toContain('private-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: AI_MODEL, stream: false, reasoning_effort: 'low', tool_choice: 'none' });
  });
  it('sends conversation as user and assistant messages with per-turn snapshots', async () => {
    const transport = vi.fn(async () => success());
    const conversation = analysisSchema.parse({ context: { topic: 'general' }, question: '가볍게', history: [
      { role: 'user', content: '게임 골라줘', context: { topic: 'general' } },
      { role: 'assistant', content: '어떤 분위기?' },
    ] });
    await complete(conversation, { apiKey: 'test', fetch: transport });
    const [, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    const { messages } = JSON.parse(init.body as string);
    expect(messages.map((message: { role: string }) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[2].content).toBe('어떤 분위기?');
    expect(JSON.parse(messages[3].content).question).toBe('가볍게');
  });
  it('accepts one native tool call and excludes private selection references from model messages', async () => {
    const ref = 's_' + '1'.repeat(24);
    const input = analysisSchema.parse({ context: { topic: 'general' }, selection: { steam: [ref] }, history: [
      { role: 'user', content: '질문', context: { topic: 'general' }, selection: { steam: [ref] } },
      { role: 'assistant', content: '답변' },
    ] });
    const messages = messagesFor(input, '', { steam: 1, lol: false, changed: false });
    expect(JSON.stringify(messages)).not.toContain(ref);
    const response = { choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [
      { id: 'call_one', type: 'function', function: { name: 'get_common_games', arguments: '{}' } },
    ] } }] };
    const transport = vi.fn(async () => Response.json(response));
    const tools = [{ type: 'function' as const, function: { name: 'get_common_games', description: '공통 게임', parameters: { type: 'object', properties: {} } } }];
    await expect(requestModel(messages, { apiKey: 'test', fetch: transport, tools })).resolves.toMatchObject({ message: { tool_calls: [{ function: { name: 'get_common_games' } }] } });
    await expect(requestModel(messages, { apiKey: 'test', fetch: transport })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it.each(['', 'NVIDIA_API_KEY', '$NVIDIA_API_KEY'])('rejects missing/placeholder credentials: %s', async apiKey => {
    const transport = vi.fn();
    await expect(complete(input, { apiKey, fetch: transport })).rejects.toMatchObject({ code: 'not_configured', status: 503 });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('does not forward upstream error bodies or retry HTTP %i', async status => {
    const transport = vi.fn(async () => new Response('secret upstream body', { status }));
    await expect(complete(input, { apiKey: 'test', fetch: transport })).rejects.toMatchObject({ status: status === 429 ? 429 : 502 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('preserves timeout vs network failures', async () => {
    await expect(complete(input, { apiKey: 'test', fetch: async () => { throw new Error('secret'); } })).rejects.toMatchObject({ code: 'network' });
    const transport: typeof fetch = (_url, init) => new Promise((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    });
    await expect(complete(input, { apiKey: 'test', fetch: transport, timeoutMs: 5 })).rejects.toMatchObject({ code: 'timeout', status: 504 });
  });
  it('rejects malformed/empty responses and marks truncated text', async () => {
    for (const body of [{}, { choices: [{ message: { content: '' } }] }]) {
      await expect(complete(input, { apiKey: 'test', fetch: async () => Response.json(body) })).rejects.toMatchObject({ code: 'invalid_response' });
    }
    await expect(complete(input, { apiKey: 'test', fetch: async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '일부' } }] }) })).resolves.toMatchObject({ truncated: true });
  });
});

it.each(['<tool_call>get_steam_recent_games<arg_key>scope</arg_key><arg_value>each</arg_value></tool_call>', '<function name="invented">{}</function>'])('rejects internal provider call markup as ordinary answer: %s', async content => {
  await expect(requestModel(messagesFor(input), { apiKey: 'test', fetch: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] }) })).rejects.toMatchObject({ code: 'invalid_response' });
});
