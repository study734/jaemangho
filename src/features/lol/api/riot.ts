import type { AccountDto, LeagueEntryDto, MasteryDto, MatchDto, SpectatorDto, SummonerDto } from '../domain/riotDto';
import { riotGet } from './riotClient';

export type Region = 'kr' | 'asia';

// 이음새: 요청 주소를 만드는 방법. 로컬 개발(vite 프록시)과 배포(서버 프록시) 두 어댑터가 있다.
export type Route = (region: Region, path: string, params?: string) => string;

export const serverRoute: Route = (region, path, params) =>
  `/api/riot?region=${region}&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

export const devProxyRoute =
  (apiKey: string): Route =>
  (region, path, params) =>
    `/riot-${region}${path}?api_key=${apiKey}${params ? '&' + params : ''}`;

// 개발 서버에서는 vite 프록시(키를 브라우저가 붙임), 그 외에는 서버 프록시(키는 서버가 보관).
export const defaultRoute = (devApiKey: string): Route => (import.meta.env.DEV ? devProxyRoute(devApiKey) : serverRoute);

type Get = typeof riotGet;
const enc = encodeURIComponent;

// Riot 데이터 접근의 전부. 호출자는 지역(kr/asia), 주소 형식, 캐시 키를 알 필요가 없다.
// 존재하지 않는 대상(404)은 null, 그 외 실패는 예외.
export interface RiotClient {
  account(gameName: string, tagLine: string): Promise<AccountDto | null>;
  summoner(puuid: string): Promise<SummonerDto | null>;
  league(puuid: string): Promise<LeagueEntryDto[] | null>;
  mastery(puuid: string): Promise<MasteryDto[] | null>;
  matchIds(puuid: string): Promise<string[] | null>;
  match(matchId: string): Promise<MatchDto | null>;
  activeGame(puuid: string): Promise<SpectatorDto | null>;
}

export function createRiotClient(route: Route, get: Get = riotGet): RiotClient {
  const account = async (name: string, tag: string) =>
    get<AccountDto>(route('asia', `/riot/account/v1/accounts/by-riot-id/${enc(name)}/${enc(tag)}`), `puuid_${name}_${tag}`, true);

  return {
    // 닉네임 표기 차이(공백 유무)를 흡수한다: 입력 그대로 -> 공백 제거 -> 두 번째 글자 앞에 공백
    async account(gameName, tagLine) {
      let found = await account(gameName, tagLine);
      if (!found && gameName.includes(' ')) found = await account(gameName.replace(/\s+/g, ''), tagLine);
      if (!found && !gameName.includes(' ') && gameName.length > 1) {
        found = await account(gameName.charAt(0) + ' ' + gameName.slice(1), tagLine);
      }
      return found;
    },
    summoner: (puuid) => get(route('kr', `/lol/summoner/v4/summoners/by-puuid/${puuid}`), `summoner_${puuid}`, true),
    league: (puuid) => get(route('kr', `/lol/league/v4/entries/by-puuid/${puuid}`), `league_${puuid}`),
    mastery: (puuid) =>
      get(route('kr', `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top`, 'count=3'), `mastery_${puuid}`),
    matchIds: (puuid) =>
      get(route('asia', `/lol/match/v5/matches/by-puuid/${puuid}/ids`, 'start=0&count=3'), `matchids_${puuid}`),
    // 끝난 매치는 바뀌지 않으므로 영구 캐시
    match: (matchId) => get(route('asia', `/lol/match/v5/matches/${matchId}`), `match_${matchId}`, true),
    activeGame: (puuid) => get(route('kr', `/lol/spectator/v5/active-games/by-puuid/${puuid}`), `spectator_${puuid}`),
  };
}
