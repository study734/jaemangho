import { proxyRiot, type RiotResult } from '../riot/proxy';
import { routeFor } from '../riot/routes';

// 서버에서 만드는 롤 전적 요약(디스코드 /전적). 웹 화면은 브라우저에서 /api/riot을 부르지만,
// 여기서는 같은 허용 경로·캐시·통계(proxyRiot)를 서버에서 직접 쓴다. 파라미터 순서를 웹과 맞춰 캐시를 공유한다.
export type RiotGet = (region: 'kr' | 'asia', path: string, params?: Record<string, string>) => Promise<RiotResult>;

export class RiotUnavailableError extends Error {
  readonly status: number;
  constructor(status: number) { super(`riot_${status}`); this.status = status; }
}

export const defaultRiotGet: RiotGet = async (region, path, params = {}) => {
  const route = routeFor(path);
  if (!route) throw new Error('riot route not allowed');
  return proxyRiot({ region, path, params: new URLSearchParams(params), route }, { apiKey: process.env.RIOT_API_KEY });
};

export interface RankSummary { tier: string; rank: string; leaguePoints: number; wins: number; losses: number }
export interface RecentGame { win: boolean; champion: string; kills: number; deaths: number; assists: number; mode: string }
export interface SummonerStats {
  gameName: string; tagLine: string; level: number | null;
  solo: RankSummary | null; flex: RankSummary | null;
  recent: RecentGame[]; inGame: boolean | null;
  // 부분 실패: 랭크는 보여주되 전적·실시간 게임을 못 읽은 것을 빈 값과 구분한다.
  failures: ('matches' | 'activeGame')[];
}

type Json = Record<string, unknown>;
const enc = encodeURIComponent;

// 404는 '없음'(null), 401/403/429/5xx는 원인을 담아 실패시킨다. 성공 상태의 본문만 쓴다.
async function read<T>(get: RiotGet, region: 'kr' | 'asia', path: string, params?: Record<string, string>): Promise<T | null> {
  const result = await get(region, path, params);
  if (result.status === 404) return null;
  if (result.status < 200 || result.status >= 300) throw new RiotUnavailableError(result.status);
  return result.body as T;
}

// 웹과 같은 닉네임 보정: 입력 그대로 -> 공백 제거 -> 두 번째 글자 앞에 공백
async function account(get: RiotGet, gameName: string, tagLine: string) {
  const find = (name: string) => read<{ puuid: string; gameName?: string; tagLine?: string }>(get, 'asia', `/riot/account/v1/accounts/by-riot-id/${enc(name)}/${enc(tagLine)}`);
  let found = await find(gameName);
  if (!found && gameName.includes(' ')) found = await find(gameName.replace(/\s+/g, ''));
  if (!found && !gameName.includes(' ') && gameName.length > 1) found = await find(`${gameName.charAt(0)} ${gameName.slice(1)}`);
  return found;
}

const rank = (entries: Json[] | null, queue: string): RankSummary | null => {
  const entry = entries?.find(e => e.queueType === queue);
  return entry ? { tier: String(entry.tier), rank: String(entry.rank ?? ''), leaguePoints: Number(entry.leaguePoints) || 0, wins: Number(entry.wins) || 0, losses: Number(entry.losses) || 0 } : null;
};

export async function summonerStats(gameName: string, tagLine: string, get: RiotGet = defaultRiotGet): Promise<SummonerStats | null> {
  const found = await account(get, gameName, tagLine);
  if (!found) return null;
  const { puuid } = found;
  const failures = new Set<SummonerStats['failures'][number]>();
  const [summoner, league, recent, active] = await Promise.all([
    read<Json>(get, 'kr', `/lol/summoner/v4/summoners/by-puuid/${puuid}`),
    read<Json[]>(get, 'kr', `/lol/league/v4/entries/by-puuid/${puuid}`),
    (async () => {
      try {
        const ids = await read<string[]>(get, 'asia', `/lol/match/v5/matches/by-puuid/${puuid}/ids`, { count: '3', start: '0' }) ?? [];
        const games = await Promise.all(ids.map(id => read<{ info?: { gameMode?: string; participants?: Json[] } }>(get, 'asia', `/lol/match/v5/matches/${id}`)));
        return games.flatMap(game => {
          const me = game?.info?.participants?.find(p => p.puuid === puuid);
          return me ? [{ win: !!me.win, champion: String(me.championName ?? '알 수 없음'), kills: Number(me.kills) || 0,
            deaths: Number(me.deaths) || 0, assists: Number(me.assists) || 0, mode: String(game?.info?.gameMode ?? '') }] : [];
        });
      } catch { failures.add('matches'); return []; }
    })(),
    read<Json>(get, 'kr', `/lol/spectator/v5/active-games/by-puuid/${puuid}`).then(game => game !== null).catch(() => { failures.add('activeGame'); return null; }),
  ]);
  return {
    gameName: found.gameName || gameName, tagLine: found.tagLine || tagLine,
    level: summoner ? Number(summoner.summonerLevel) || null : null,
    solo: rank(league, 'RANKED_SOLO_5x5'), flex: rank(league, 'RANKED_FLEX_SR'),
    recent, inGame: active, failures: [...failures].sort(),
  };
}
