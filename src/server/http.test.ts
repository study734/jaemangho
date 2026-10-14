import { afterEach, expect, it, vi } from 'vitest';
import { serverError } from './http';
import { failureDetails, reportFailure } from './diagnostics';

afterEach(() => vi.restoreAllMocks());

it('500 응답과 로그를 같은 오류 ID로 연결하고 원문 비밀값은 남기지 않는다', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('password=do-not-log'), { code: '42P01', detail: 'private payload' });
  const response = serverError(error, 'members.list');
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.error).toBe('Server error');
  expect(body.requestId).toMatch(/^[\da-f-]{36}$/);
  expect(response.headers.get('X-Request-ID')).toBe(body.requestId);
  expect(log).toHaveBeenCalledWith('[failure]', expect.objectContaining({
    requestId: body.requestId, operation: 'members.list', code: '42P01', locations: expect.any(Array),
  }));
  expect(JSON.stringify(log.mock.calls)).not.toContain('do-not-log');
  expect(JSON.stringify(log.mock.calls)).not.toContain('private payload');
});

it('HTTP 상태와 중첩된 네트워크 원인을 보존한다', () => {
  const error = Object.assign(new Error('upstream private URL', {
    cause: Object.assign(new Error('private response'), { code: 'ECONNRESET' }),
  }), { status: 502 });
  expect(failureDetails(error)).toMatchObject({ code: 'http_502', status: 502, cause: { code: 'ECONNRESET' } });
});

it('타임아웃과 알 수 없는 오류를 구분하고 순환 cause를 제한한다', () => {
  const error = new Error('secret');
  error.cause = error;
  expect(() => failureDetails(error)).not.toThrow();
  expect(failureDetails(new DOMException('secret', 'TimeoutError'))).toMatchObject({ code: 'timeout' });
  expect(failureDetails('secret')).toEqual({ code: 'unknown' });
  expect(failureDetails({ code: 'secret-token', status: 'secret' })).toEqual({ code: 'unexpected' });
});

it('오류 ID는 호출마다 새로 발급한다', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(reportFailure('home.feed', null)).not.toBe(reportFailure('home.feed', null));
});
