import type { z } from 'zod';
import { reportFailure } from './diagnostics';

// 요청 입구에서의 입력 검증. 통과하면 타입이 정해진 data, 아니면 바로 돌려줄 400 응답.
export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

const invalid = (error: z.ZodError): Parsed<never> => ({
  ok: false,
  response: Response.json(
    { error: 'Invalid request', issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    { status: 400 }
  ),
});

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  const json = await request.json().catch(() => null);
  const result = schema.safeParse(json);
  return result.success ? { ok: true, data: result.data } : invalid(result.error);
}

// Enforce the byte limit for streamed/chunked input before JSON allocation.
export async function parseBounded<S extends z.ZodType>(request: Request, schema: S, limit: number): Promise<Parsed<z.infer<S>>> {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return { ok: false, response: Response.json({ error: '다른 사이트에서 요청할 수 없어요.' }, { status: 403 }) };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: Response.json({ error: '입력 내용이 필요해요.' }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return { ok: false, response: Response.json({ error: '입력 내용이 너무 커요.' }, { status: 413 }) }; }
      chunks.push(value);
    }
  } catch { return { ok: false, response: Response.json({ error: '입력 내용을 읽지 못했어요.' }, { status: 400 }) }; }
  return parseBody(new Request(request.url, { method: 'POST', body: Buffer.concat(chunks) }), schema);
}

export function parseQuery<S extends z.ZodType>(params: URLSearchParams, schema: S): Parsed<z.infer<S>> {
  const result = schema.safeParse(Object.fromEntries(params));
  return result.success ? { ok: true, data: result.data } : invalid(result.error);
}

// 예상하지 못한 오류는 내용을 숨기고 로그에만 남긴다
export function serverError(e: unknown, operation = 'http.request') {
  const requestId = reportFailure(operation, e);
  return Response.json({ error: 'Server error', requestId }, {
    status: 500, headers: { 'X-Request-ID': requestId },
  });
}
