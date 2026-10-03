// 실행: node api/_lib/auth.check.mjs  (세션 서명/만료/변조 검증)
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'test-secret';
const { makeToken, readToken, parseCookies, isGuildAdmin } = await import('./auth.js');

const now = Math.floor(Date.now() / 1000);
const ok = makeToken({ id: '1', name: 'a', exp: now + 60 });
assert.equal(readToken(ok).id, '1');
assert.equal(readToken(makeToken({ id: '1', exp: now - 1 })), null, 'expired');
const [body, sig] = ok.split('.');
const forged = Buffer.from(JSON.stringify({ id: '999', exp: now + 60 })).toString('base64url');
assert.equal(readToken(`${forged}.${sig}`), null, 'forged payload');
assert.equal(readToken(`${body}.x`), null, 'bad signature');
assert.equal(readToken(undefined), null);
assert.equal(parseCookies({ headers: { cookie: 'a=1; jmh_session=x=y' } }).jmh_session, 'x=y');

// 관리자 판정: 소유자 또는 Administrator(0x8) 비트
assert.equal(isGuildAdmin({ owner: true, permissions: '0' }), true, 'owner');
assert.equal(isGuildAdmin({ owner: false, permissions: '8' }), true, 'administrator');
assert.equal(isGuildAdmin({ owner: false, permissions: '2147483647' }), true, 'admin bit among many');
assert.equal(isGuildAdmin({ owner: false, permissions: '104324673' }), false, 'no admin bit');
assert.equal(isGuildAdmin({ owner: false }), false, 'missing permissions');
console.log('auth ok');
