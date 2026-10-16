import { z } from 'zod';
import { SYSTEM_PROMPT, type AnalysisInput } from './context';

export const AI_MODEL = 'z-ai/glm-5.3-flash';
export class AiError extends Error {
  code: 'not_configured' | 'network' | 'timeout' | 'invalid_response' | 'upstream' | 'busy';
  status: number;
  // Where a timeout happened ('acquire', 'charge', 'model', 'tool'); logged by failureDetails.
  phase?: string; elapsedMs?: number;
  constructor(code: AiError['code'], status: number, message: string, upstreamStatus?: number) {
    super(message, upstreamStatus ? { cause: { status: upstreamStatus } } : undefined); this.code = code; this.status = status;
  }
}
export interface ToolDefinition { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
const completionSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.string().nullable().optional(), message: z.object({
    content: z.string().trim().max(16000).nullable().optional(),
    tool_calls: z.array(z.object({ id: z.string().min(1).max(200), type: z.literal('function'),
      function: z.object({ name: z.string().min(1).max(100), arguments: z.string().max(2000) }),
    })).min(1).max(1).optional(),
  }),
})).min(1) });

export function messagesFor(input: AnalysisInput, preference = '', scope?: { steam: number; lol: boolean; changed: boolean }): ModelMessage[] {
  return [{ role: 'system', content: SYSTEM_PROMPT },
    ...(preference ? [{ role: 'user' as const, content: JSON.stringify({ savedPreference: preference, note: '사용자가 저장한 취향 자료. 현재 질문이 우선한다.' }) }] : []),
    ...input.history.map(message => message.role === 'user'
      ? { role: 'user' as const, content: JSON.stringify({ question: message.content, context: message.context }) }
      : { role: 'assistant' as const, content: message.content }),
    { role: 'user', content: JSON.stringify({ context: input.context, question: input.question, ...(scope ? { selectedMembers: scope } : {}) }) }];
}

export interface ModelOptions { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; tools?: ToolDefinition[] }
// Provider transport has no dependency on Jaemangho's tools, database or UI.
export async function requestModel(messages: ModelMessage[], options: ModelOptions = {}) {
  const key = (options.apiKey ?? process.env.NVIDIA_API_KEY)?.trim();
  if (!key || key === '$NVIDIA_API_KEY' || key === 'NVIDIA_API_KEY')
    throw new AiError('not_configured', 503, 'AI 연결이 준비되지 않았어요. 서버의 NVIDIA_API_KEY 설정을 확인해 주세요.');
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 25_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // GLM-5.3-Flash defaults to max reasoning; low suits short chat turns.
      body: JSON.stringify({ model: AI_MODEL, reasoning_effort: 'low', temperature: 0.5, top_p: 1, max_tokens: 2048, stream: false,
        // NIM can emit raw call markup after a native tool result when this is
        // omitted. Explicitly end tool selection for conversation/final replies.
        messages, ...(options.tools ? { tools: options.tools, tool_choice: 'auto', parallel_tool_calls: false } : { tool_choice: 'none' }), }),
    });
  } catch {
    throw signal.aborted ? new AiError('timeout', 504, 'AI 응답 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.')
      : new AiError('network', 502, 'AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    // Never read/forward upstream error text, which can include request data.
    void response.body?.cancel();
    const message = response.status === 429 ? 'AI 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
      : [401, 403].includes(response.status) ? 'AI 인증에 실패했어요. 서버의 NVIDIA API 키와 모델 접근 권한을 확인해 주세요.'
        : 'AI 서버가 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new AiError('upstream', response.status === 429 ? 429 : 502, message, response.status);
  }
  try {
    const result = completionSchema.parse(await response.json());
    const choice = result.choices[0];
    if (choice.finish_reason && !['stop', 'length', 'tool_calls'].includes(choice.finish_reason)) throw new Error('invalid completion');
    if (!choice.message.tool_calls && !choice.message.content) throw new Error('empty completion');
    // Never execute provider call markup emitted as ordinary content, or show it
    // as a successful answer when no native tool call was returned.
    if (choice.message.content && /<\/?(?:tool_call|arg_key|arg_value|function)[\s>]|<\|tool_call/i.test(choice.message.content)) throw new Error('tool markup in content');
    if (choice.message.tool_calls && (!options.tools || choice.finish_reason === 'length')) throw new Error('unexpected tool call');
    return { message: { ...choice.message, content: choice.message.content ?? null }, truncated: choice.finish_reason === 'length', model: AI_MODEL };
  } catch {
    if (signal.aborted) throw new AiError('timeout', 504, 'AI 응답 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.');
    throw new AiError('invalid_response', 502, 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  }
}

export async function complete(input: AnalysisInput, options: ModelOptions = {}) {
  const result = await requestModel(messagesFor(input), options);
  return { answer: result.message.content!, model: result.model, truncated: result.truncated };
}
