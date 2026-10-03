import type { AccountDto, LeagueEntryDto, MasteryDto, MatchDto, SpectatorDto, SummonerDto } from '../domain/riotDto';
import { riotGet } from './riotClient';

type Region = 'kr' | 'asia';

// 앞으로 로그인한 사용자의 요청은 모두 서버(/api/riot)를 거친다. 키는 서버에만 있다.
const route = (region: Region, path: string, params?: string) =>
  `/api/riot?region=${region}&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

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

export function createRiotClient(get: Get = riotGet): RiotClient {
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
