import type { z } from 'zod';

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

export function parseQuery<S extends z.ZodType>(params: URLSearchParams, schema: S): Parsed<z.infer<S>> {
  const result = schema.safeParse(Object.fromEntries(params));
  return result.success ? { ok: true, data: result.data } : invalid(result.error);
}

// 예상하지 못한 오류는 내용을 숨기고 로그에만 남긴다
export function serverError(e: unknown) {
  console.error(e);
  return Response.json({ error: 'Server error' }, { status: 500 });
}
