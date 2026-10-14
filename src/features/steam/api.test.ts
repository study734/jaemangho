import { afterEach, expect, it, vi } from 'vitest';
import { steamApi, SteamApiError, steamErrorMessage } from './api';

afterEach(() => vi.unstubAllGlobals());

it('Steam 오류 ID와 인증·권한 실패를 보존한다', async () => {
  const requestId = '12345678-1234-1234-1234-123456789abc';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500, headers: { 'X-Request-ID': requestId } })));
  const error = await steamApi.list().catch(error => error);
  expect(error).toBeInstanceOf(SteamApiError);
  expect(error).toMatchObject({ status: 500, requestId });
  expect(steamErrorMessage(error)).toContain(requestId);
  expect(steamErrorMessage(new SteamApiError(401))).toContain('로그인');
  expect(steamErrorMessage(new SteamApiError(403))).toContain('권한');
});

it('비정상 오류 ID는 사용자에게 전달하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500, headers: { 'X-Request-ID': 'private-invalid-id' } })));
  await expect(steamApi.list()).rejects.toMatchObject({ requestId: null });
});
