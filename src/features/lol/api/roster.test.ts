import { afterEach, expect, it, vi } from 'vitest';
import { rosterApi, RosterRequestError, rosterFailureMessage } from './roster';

afterEach(() => vi.unstubAllGlobals());

it.each([401, 403, 409, 500])('HTTP %i와 오류 ID를 보존한다', async status => {
  const requestId = '12345678-1234-1234-1234-123456789abc';
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"private server details"}', {
    status, headers: { 'X-Request-ID': requestId },
  })));
  const error = await rosterApi.list().catch(error => error);
  expect(error).toBeInstanceOf(RosterRequestError);
  expect(error).toMatchObject({ status, requestId });
  expect(rosterFailureMessage(error)).toContain(requestId);
  expect(rosterFailureMessage(error)).not.toContain('private');
});

it('중복과 세션 만료를 구분하며 비정상 오류 ID를 출력하지 않는다', async () => {
  expect(rosterFailureMessage(new RosterRequestError(409, null))).toContain('이미 등록');
  expect(rosterFailureMessage(new RosterRequestError(401, null))).toContain('로그인');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500, headers: { 'X-Request-ID': 'private-input' } })));
  await expect(rosterApi.list()).rejects.toMatchObject({ status: 500, requestId: null });
  expect(rosterFailureMessage(new TypeError('secret URL'))).not.toContain('secret');
});
