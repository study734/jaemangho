// 앱이 실제로 쓰는 Riot 엔드포인트와 서버 캐시 유효시간(초). 목록에 없는 경로는 프록시하지 않는다.
const ID = '[\\w-]+';
const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ROUTES = [
  // 닉네임 -> puuid (거의 변하지 않음)
  { re: /^\/riot\/account\/v1\/accounts\/by-riot-id\/[^/?#]+\/[^/?#]+$/, ttl: DAY },
  { re: new RegExp(`^/lol/summoner/v4/summoners/by-puuid/${ID}$`), ttl: HOUR },
  { re: new RegExp(`^/lol/league/v4/entries/by-puuid/${ID}$`), ttl: 5 * MIN },
  { re: new RegExp(`^/lol/champion-mastery/v4/champion-masteries/by-puuid/${ID}/top$`), ttl: HOUR },
  { re: new RegExp(`^/lol/match/v5/matches/by-puuid/${ID}/ids$`), ttl: 5 * MIN },
  // 끝난 매치는 불변이지만 응답이 커서(수십 KB) 저장 용량을 위해 7일만 보관
  { re: /^\/lol\/match\/v5\/matches\/[A-Z0-9_]+$/, ttl: 7 * DAY },
  { re: new RegExp(`^/lol/spectator/v5/active-games/by-puuid/${ID}$`), ttl: 30 },
];

export const routeFor = (path) => (path.includes('..') ? undefined : ROUTES.find((r) => r.re.test(path)));
