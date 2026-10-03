// 실행: node api/_lib/riotRoutes.check.mjs  (허용 경로와 캐시 TTL 검증)
import assert from 'node:assert/strict';
const { routeFor } = await import('./riotRoutes.js');

const ttl = (p) => routeFor(p)?.ttl;
assert.equal(ttl('/riot/account/v1/accounts/by-riot-id/오채/KR1'), 86400);
assert.equal(ttl('/lol/league/v4/entries/by-puuid/abc-123_X'), 300);
assert.equal(ttl('/lol/match/v5/matches/KR_1234567'), 7 * 86400);
assert.equal(ttl('/lol/spectator/v5/active-games/by-puuid/abc'), 30);
assert.equal(routeFor('/lol/platform/v3/champion-rotations'), undefined, 'unlisted path');
assert.equal(routeFor('/lol/match/v5/matches/by-puuid/a/ids/../../x'), undefined, 'traversal');
assert.equal(routeFor('/lol/league/v4/entries/by-puuid/a/b'), undefined, 'extra segment');
console.log('routes ok');
