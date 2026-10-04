import { describe, expect, it } from 'vitest';
import { routeKey } from './track';

describe('routeKey', () => {
  it.each([
    ['/', '/'],
    ['/steam', '/steam'],
    ['/steam/', '/steam'], // 끝의 슬래시 무시
    ['/lol/squad', '/lol/squad'],
    ['/community/awards', '/community/awards'],
    ['/people/abc123', '/people/[id]'], // 프로필은 id를 버리고 하나로 합친다
    ['/people', '/people'],
  ])('%s -> %s', (path, key) => expect(routeKey(path)).toBe(key));

  it.each(['', '/unknown', '/api/members', '/people/a/b', '/people//x', '/steam?x=1', '/admin/secret', 'steam'])('세지 않는 주소: %j', (path) =>
    expect(routeKey(path)).toBeNull()
  );
});
