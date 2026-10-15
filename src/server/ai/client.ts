import { z } from 'zod';
import { SYSTEM_PROMPT, type AnalysisInput } from './context';

export const AI_MODEL = 'z-ai/glm-5.3-flash';
export class AiError extends Error {
  code: 'not_configured' | 'network' | 'timeout' | 'invalid_response' | 'upstream' | 'busy';
  status: number;
  constructor(code: AiError['code'], status: number, message: string, upstreamStatus?: number) {
    super(message, upstreamStatus ? { cause: { status: upstreamStatus } } : undefined); this.code = code; this.status = status;
  }
}
const completionSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.string().nullable().optional(), message: z.object({ content: z.string().trim().min(1).max(16000) }),
})).min(1) });

// Fixed endpoint/model and an injected transport keep credentials on the server
// and allow failures to be reproduced without contacting NVIDIA.
export async function complete(input: AnalysisInput, options: { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const key = (options.apiKey ?? process.env.NVIDIA_API_KEY)?.trim();
  if (!key || key === '$NVIDIA_API_KEY' || key === 'NVIDIA_API_KEY')
    throw new AiError('not_configured', 503, 'AI 연결이 준비되지 않았어요. 서버의 NVIDIA_API_KEY 설정을 확인해 주세요.');
  const signal = AbortSignal.timeout(options.timeoutMs ?? 25_000);
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AI_MODEL, temperature: 0.5, top_p: 1, max_tokens: 2048, stream: false,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(input) }] }),
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
    if (choice.finish_reason && !['stop', 'length'].includes(choice.finish_reason)) throw new Error('invalid completion');
    return { answer: choice.message.content, truncated: choice.finish_reason === 'length', model: AI_MODEL };
  } catch {
    if (signal.aborted) throw new AiError('timeout', 504, 'AI 응답 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.');
    throw new AiError('invalid_response', 502, 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  }
}
