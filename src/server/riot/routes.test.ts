import { describe, expect, it } from 'vitest';
import { routeFor } from './routes';

const ttl = (path: string) => routeFor(path)?.ttl;

describe('routeFor (허용 경로와 캐시 TTL)', () => {
  it('허용된 경로는 엔드포인트별 TTL을 돌려준다', () => {
    expect(ttl('/riot/account/v1/accounts/by-riot-id/오채/KR1')).toBe(86400);
    expect(ttl('/lol/league/v4/entries/by-puuid/abc-123_X')).toBe(300);
    expect(ttl('/lol/match/v5/matches/KR_1234567')).toBe(7 * 86400);
    expect(ttl('/lol/spectator/v5/active-games/by-puuid/abc')).toBe(30);
  });
  it('목록에 없는 경로는 거부한다', () => {
    expect(routeFor('/lol/platform/v3/champion-rotations')).toBeUndefined();
  });
  it('경로 우회(..)와 추가 구간은 거부한다', () => {
    expect(routeFor('/lol/match/v5/matches/by-puuid/a/ids/../../x')).toBeUndefined();
    expect(routeFor('/lol/league/v4/entries/by-puuid/a/b')).toBeUndefined();
  });
});
