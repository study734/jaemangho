import { afterEach, expect, it, vi } from 'vitest';
import { requestJson } from './request.mjs';

afterEach(() => vi.useRealTimers());

it.each(['success', 'redirect', 'invalid_json', 'fetch_failure'])('완료된 요청 타이머를 남기지 않는다: %s', async mode => {
  vi.useFakeTimers();
  const fetchFn = async () => {
    if (mode === 'fetch_failure') throw new Error('network');
    if (mode === 'redirect') return new Response('redirect', { status: 302 });
    if (mode === 'invalid_json') return new Response('not json');
    return Response.json({ ok: true });
  };
  if (mode === 'success') expect(await requestJson(fetchFn, 'https://example.com', 65000)).toEqual({ ok: true });
  else await expect(requestJson(fetchFn, 'https://example.com', 65000)).rejects.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});

it('요청 제한 시간이 지나면 실제 요청을 취소한다', async () => {
  vi.useFakeTimers();
  const fetchFn = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const result = expect(requestJson(fetchFn, 'https://example.com', 15000)).rejects.toThrow('aborted');
  await vi.advanceTimersByTimeAsync(15000);
  await result; expect(vi.getTimerCount()).toBe(0);
});
