import { beforeAll, describe, expect, it } from 'vitest';
import { isGuildAdmin, makeToken, readToken } from './session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret';
});

const now = () => Math.floor(Date.now() / 1000);

describe('세션 토큰', () => {
  it('서명된 토큰을 읽는다', () => {
    expect(readToken(makeToken({ id: '1', name: 'a', exp: now() + 60 }))?.id).toBe('1');
  });
  it('만료된 토큰은 거부한다', () => {
    expect(readToken(makeToken({ id: '1', name: 'a', exp: now() - 1 }))).toBeNull();
  });
  it('내용을 바꾼 토큰은 거부한다', () => {
    const [, sig] = makeToken({ id: '1', name: 'a', exp: now() + 60 }).split('.');
    const forged = Buffer.from(JSON.stringify({ id: '999', exp: now() + 60 })).toString('base64url');
    expect(readToken(`${forged}.${sig}`)).toBeNull();
  });
  it('서명이 틀리거나 비어 있으면 거부한다', () => {
    const [body] = makeToken({ id: '1', name: 'a', exp: now() + 60 }).split('.');
    expect(readToken(`${body}.x`)).toBeNull();
    expect(readToken(undefined)).toBeNull();
    expect(readToken('')).toBeNull();
  });
});

describe('isGuildAdmin', () => {
  it('서버 소유자는 관리자', () => expect(isGuildAdmin({ owner: true, permissions: '0' })).toBe(true));
  it('Administrator(0x8) 비트가 있으면 관리자', () => {
    expect(isGuildAdmin({ owner: false, permissions: '8' })).toBe(true);
    expect(isGuildAdmin({ owner: false, permissions: '2147483647' })).toBe(true);
  });
  it('그 외는 관리자가 아니다', () => {
    expect(isGuildAdmin({ owner: false, permissions: '104324673' })).toBe(false);
    expect(isGuildAdmin({ owner: false })).toBe(false);
  });
});
