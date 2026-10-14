import { afterEach, expect, it, vi } from 'vitest';
import { requestJson, HttpRequestError } from './http-client';

afterEach(() => vi.unstubAllGlobals());

it('에러 HTTP 상태·오류 ID와 서버의 사용자 안내를 유지한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"점검 실패"}', {
    status: 500, headers: { 'X-Request-ID': '12345678-1234-1234-1234-123456789abc' },
  })));
  const error = await requestJson('/api/test').catch(error => error);
  expect(error).toBeInstanceOf(HttpRequestError);
  if (!(error instanceof HttpRequestError)) throw error;
  expect(error).toMatchObject({ status: 500, code: 'http' });
  expect(error.message).toContain('점검 실패');
  expect(error.message).toContain('12345678-');
});

it.each([200, 504])('JSON 아닌 HTTP %i는 원문을 노출하지 않고 실패를 분류한다', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private gateway details', { status })));
  const error = await requestJson('/api/test').catch(error => error);
  if (!(error instanceof HttpRequestError)) throw error;
  expect(error).toMatchObject({ status, code: status === 200 ? 'invalid_response' : 'http' });
  expect(error.message).not.toContain('private');
});

it('연결 실패와 정상 204를 구분하고 요청 인자를 유지한다', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('secret URL')).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  await expect(requestJson('/api/test')).rejects.toMatchObject({ status: 0, code: 'network' });
  await expect(requestJson('/api/test', { method: 'DELETE' })).resolves.toBeNull();
  expect(fetch).toHaveBeenLastCalledWith('/api/test', { cache: 'no-store', method: 'DELETE' });
});
