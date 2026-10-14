const validId = (value: string | null) => value && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value) ? value : null;

export class HttpRequestError extends Error {
  status: number;
  requestId: string | null;
  code: 'http' | 'network' | 'invalid_response';
  constructor(status: number, requestId: string | null, message: string, code: HttpRequestError['code'] = 'http') {
    super(`${message}${requestId ? ` 오류 ID: ${requestId}` : ''}`);
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

// Shared by app UI. Feature modules retain their own transport and domain error
// messages so that their public interface does not depend on app internals.
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', ...init }); }
  catch { throw new HttpRequestError(0, null, '네트워크 연결을 확인하고 다시 시도해 주세요.', 'network'); }
  const requestId = validId(response.headers.get('X-Request-ID'));
  if (response.status === 204) return null as T;
  let body: unknown;
  try { body = await response.json(); }
  catch {
    throw new HttpRequestError(response.status, requestId,
      response.ok ? '응답을 해석하지 못했습니다.' : `요청 실패 (HTTP ${response.status})`, response.ok ? 'invalid_response' : 'http');
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error.slice(0, 300) : `요청 실패 (HTTP ${response.status})`;
    throw new HttpRequestError(response.status, requestId, message);
  }
  if (body === null) throw new HttpRequestError(response.status, requestId, '응답을 해석하지 못했습니다.', 'invalid_response');
  return body as T;
}

export const clientErrorMessage = (error: unknown) => error instanceof Error ? error.message : '요청에 실패했습니다.';
