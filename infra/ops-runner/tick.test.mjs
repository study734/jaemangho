import { expect, it } from 'vitest';
import { tick } from './tick.mjs';
import worker, { OperationsRunner } from './worker.mjs';
const webhook = 'https://discord.com/api/webhooks/123456789012345678/token';
function requests({ failure = false, databaseFailure = false, domainFailure = false, badSecret = false, notificationFailure = false, recoveryFailure = false, redirectAt } = {}) {
  const calls = [];
  return { calls, fetchFn: async (input, init) => {
    const url = new URL(input); calls.push({ url, init });
    if (init.redirect === 'error') throw new TypeError('Invalid redirect value in workerd');
    expect(init.redirect).toBe('manual');
    if (url.pathname === redirectAt || redirectAt === 'webhook' && url.hostname === 'discord.com') return new Response(null, { status: 302, headers: { Location: 'https://attacker.example/redirect' } });
    if (url.hostname === 'discord.com') return new Response(null, { status: notificationFailure ? 503 : 204 });
    if (url.pathname === '/api/health/live') {
      expect(init.headers.Authorization).toBeUndefined();
      return Response.json({ ok: !failure && !(domainFailure && url.hostname === 'www.jaemangho.shop'), kind: 'liveness' });
    }
    expect(url.hostname).toBe('jaemangho.vercel.app');
    if (url.pathname === '/api/health') { expect(init.headers.Authorization).toBeUndefined(); return Response.json({ ok: !databaseFailure }); }
    expect(init.headers.Authorization).toBe('Bearer test-secret');
    if (badSecret) return new Response(null, { status: 401 });
    if (url.pathname === '/api/cron/recovery') { if (recoveryFailure) throw new Error('timeout'); return Response.json({ recovery: 'waiting' }); }
    return Response.json({ skipped: false, active: 0 });
  } };
}
it('정상 실행과 복구 대기는 조용히 기록한다', async () => {
  const f = requests(); const result = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  expect(result.status).toBe('healthy'); expect(result.recovery).toBe('waiting'); expect(f.calls).toHaveLength(5); expect(JSON.stringify(result)).not.toContain('test-secret');
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
  const f = requests(); const result = await tick({ webhook: 'https://attacker.example', fetchFn: f.fetchFn }); expect(result.notificationFailed).toBe(true); expect(f.calls).toHaveLength(2);
  expect(f.calls.every(c => c.init.headers.Authorization === undefined)).toBe(true);
});
it('공개 접근과 동시 실행을 차단한다', async () => {
  expect((await worker.fetch(new Request('https://runner.example'))).status).toBe(404);
  const data = new Map([['lease', Date.now() + 60000]]);
  const storage = { get: async key => data.get(key), put: async (key, value) => data.set(key, value), delete: async key => data.delete(key), transaction: async fn => fn(storage) };
  const runner = new OperationsRunner({ storage }, {});
  expect((await runner.fetch(new Request('https://internal/tick', { method: 'POST' }))).status).toBe(409);
});

it.each([['/api/health/live', 'unavailable'], ['/api/health', 'database_unavailable'], ['/api/cron/recovery', 'execution'], ['/api/cron/ops', 'execution']])('운영 API 리디렉션을 따라가지 않는다: %s', async (redirectAt, status) => {
  const f = requests({ redirectAt });
  const result = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  expect(result.status).toBe(status);
  expect(f.calls.every(c => ['jaemangho.vercel.app', 'www.jaemangho.shop'].includes(c.url.hostname))).toBe(true);
  if (redirectAt === '/api/cron/recovery') expect(f.calls.at(-1).url.pathname).toBe('/api/cron/ops');
});

it('5분 실행은 DB를 깨우지 않고 다음 30분 구간에서만 점검·복구한다', async () => {
  const f = requests();
  let state = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  for (const now of [300001, 600001, 900001, 1200001, 1500001]) {
    state = await tick({ state, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now });
    expect(state.status).toBe('healthy'); expect(state.operations.checkedAt).toBe(1);
  }
  expect(f.calls.filter(c => c.url.pathname === '/api/health')).toHaveLength(1);
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1800001 });
  expect(state.operations.checkedAt).toBe(1800001);
  expect(f.calls.filter(c => c.url.pathname === '/api/cron/recovery')).toHaveLength(2);
});

it('사용자 도메인만 실패해도 복구 요청은 기본 주소에서 계속 실행하고 별도 알린다', async () => {
  const f = requests({ domainFailure: true });
  let state = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  expect(state.status).toBe('domain_unavailable'); expect(state.recovery).toBe('waiting');
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 600001 });
  expect(state.notified).toBe('domain_unavailable');
  expect(f.calls.filter(c => c.url.hostname === 'www.jaemangho.shop').every(c => !c.init.headers.Authorization)).toBe(true);
});

it('DB 장애는 5분마다 재확인하고 정상 liveness로 해제하지 않는다', async () => {
  const broken = requests({ databaseFailure: true });
  let state = await tick({ secret: 'test-secret', webhook, fetchFn: broken.fetchFn, now: 1 });
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: broken.fetchFn, now: 300001 });
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: broken.fetchFn, now: 600001 });
  expect(state.notified).toBe('database_unavailable');
  expect(broken.calls.filter(c => c.url.pathname === '/api/health')).toHaveLength(3);
  const normal = requests();
  state = await tick({ state, secret: 'test-secret', webhook, fetchFn: normal.fetchFn, now: 900001 });
  expect(state.status).toBe('healthy'); expect(state.notified).toBe('healthy');
});

it('이전 버전 상태와 시계 역행에서도 전체 DB 점검부터 시작한다', async () => {
  const f = requests();
  const migrated = await tick({ state: { status: 'healthy', checkedAt: 100 }, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 200 });
  const result = await tick({ state: migrated, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  expect(result.operations.checkedAt).toBe(1);
  expect(f.calls.filter(c => c.url.pathname === '/api/health')).toHaveLength(2);
});
it('알림 웹훅 리디렉션은 전달 실패로 남기고 외부로 따라가지 않는다', async () => {
  const f = requests({ failure: true, redirectAt: 'webhook' });
  const state = await tick({ secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 1 });
  const result = await tick({ state, secret: 'test-secret', webhook, fetchFn: f.fetchFn, now: 600001 });
  expect(result.notificationFailed).toBe(true); expect(result.notified).toBe('healthy');
  expect(f.calls.some(c => c.url.hostname === 'attacker.example')).toBe(false);
  const notification = f.calls.find(c => c.url.hostname === 'discord.com');
  expect(notification.init.headers.Authorization).toBeUndefined();
});
