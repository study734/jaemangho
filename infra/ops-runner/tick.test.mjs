import { expect, it } from 'vitest';
import { tick } from './tick.mjs';
import worker, { OperationsRunner } from './worker.mjs';
const webhook = 'https://discord.com/api/webhooks/123456789012345678/token';
function requests({ failure = false, badSecret = false, notificationFailure = false, recoveryFailure = false } = {}) {
  const calls = [];
  return { calls, fetchFn: async (input, init) => {
    const url = new URL(input); calls.push({ url, init }); expect(init.redirect).toBe('error');
    if (url.hostname === 'discord.com') return new Response(null, { status: notificationFailure ? 503 : 204 });
    expect(url.hostname).toBe('jaemangho.vercel.app');
    if (url.pathname === '/api/health') { expect(init.headers.Authorization).toBeUndefined(); return Response.json({ ok: !failure }); }
    expect(init.headers.Authorization).toBe('Bearer test-secret');
    if (badSecret) return new Response(null, { status: 401 });
    if (url.pathname === '/api/cron/recovery') { if (recoveryFailure) throw new Error('timeout'); return Response.json({ recovery: 'waiting' }); }
    return Response.json({ skipped: false, active: 0 });
  } };
}
it('정상 실행과 복구 대기는 조용히 기록한다', async () => {
  const f = requests(); const result = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  expect(result.status).toBe('healthy'); expect(result.recovery).toBe('waiting'); expect(f.calls).toHaveLength(3); expect(JSON.stringify(result)).not.toContain('test-secret');
});
it('10분 지속 장애·중복 방지·정상화 알림을 기록한다', async () => {
  const f = requests({ failure: true }); let state = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  expect(f.calls.filter(c => c.url.hostname === 'discord.com')).toHaveLength(0);
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 600001 });
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 900001 });
  expect(f.calls.filter(c => c.url.hostname === 'discord.com')).toHaveLength(1);
  const normal = requests(); state = await tick({ state, secret: 'test-secret', webhook, fetchFn: normal.fetchFn, now: 1200001 });
  expect(state.notified).toBe('healthy'); expect(normal.calls.filter(c => c.url.hostname === 'discord.com')).toHaveLength(1);
});
it('복구 요청 실패 뒤에도 점검하며 인증 오류는 즉시 개입을 알린다', async () => {
  const f = requests({ recoveryFailure: true }); expect((await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn })).status).toBe('execution'); expect(f.calls.at(-1).url.pathname).toBe('/api/cron/ops');
  const auth = requests({ badSecret: true }); expect((await tick({ secret: 'test-secret', webhook, fetchFn: auth.fetchFn })).notified).toBe('configuration');
});
it('외부 웹훅으로 비밀값을 전달하지 않는다', async () => {
  const f = requests(); const result = await tick({ webhook: 'https://attacker.example', fetchFn: f.fetchFn }); expect(result.notificationFailed).toBe(true); expect(f.calls).toHaveLength(0);
});
it('공개 접근과 동시 실행을 차단한다', async () => {
  expect((await worker.fetch(new Request('https://runner.example'))).status).toBe(404);
  const data = new Map([['lease', Date.now() + 60000]]);
  const storage = { get: async key => data.get(key), put: async (key, value) => data.set(key, value), delete: async key => data.delete(key), transaction: async fn => fn(storage) };
  const runner = new OperationsRunner({ storage }, {});
  expect((await runner.fetch(new Request('https://internal/tick', { method: 'POST' }))).status).toBe(409);
});
