import type { ActiveGame, ChampionMastery, Member, MatchHistory } from '../types';
import { toActiveGame, toChampionMastery, toMatchHistory, toRankSummary } from '../domain/mappers';
import type { RiotClient } from './riot';

// 롤 데이터를 화면이 쓰는 모양으로 가져오는 전부. 화면은 이 세 함수만 안다.
export type Summoner = Omit<Member, 'id' | 'matches' | 'activeGame'>;
// 목록에 뜨는 기본 정보 (Riot ID로 계정을 찾고, 레벨/아이콘/랭크를 합친다)
export type Overview = Pick<Member, 'summonerLevel' | 'profileIconId' | 'tier' | 'rank' | 'leaguePoints' | 'wins' | 'losses'>;
// 상세 화면에서 늦게(lazy) 불러오는 정보
export interface Details {
  championMasteries: ChampionMastery[];
  matches: MatchHistory[];
  activeGame: ActiveGame | null;
}

export interface LolData {
  lookup(gameName: string, tagLine: string): Promise<Summoner>;
  overview(member: Pick<Member, 'gameName' | 'tagLine'>): Promise<Overview>;
  // 계정을 찾지 못하면 null. 부분 실패(숙련도/매치/실시간 게임)는 빈 값으로 대체해 나머지는 보여준다.
  details(member: Pick<Member, 'gameName' | 'tagLine'>): Promise<Details | null>;
}

const warn = (what: string) => (err: unknown) => console.warn(what, err);

export function createLolData(riot: RiotClient): LolData {
  const notFound = (name: string, tag: string) =>
    new Error(`존재하지 않는 Riot ID입니다 (HTTP 404). 소환사명(${name})과 태그(#${tag})에 오타가 없는지 확인해 주세요.`);

  async function overviewOf(puuid: string): Promise<Overview> {
    const [summoner, league] = await Promise.all([riot.summoner(puuid), riot.league(puuid)]);
    if (!summoner) throw new Error('소환사 상세조회 실패');
    return { summonerLevel: summoner.summonerLevel, profileIconId: summoner.profileIconId, ...toRankSummary(league) };
  }

  return {
    async lookup(gameName, tagLine) {
      const account = await riot.account(gameName, tagLine);
      if (!account) throw notFound(gameName, tagLine);
      return {
        gameName: account.gameName || gameName,
        tagLine: account.tagLine || tagLine,
        ...(await overviewOf(account.puuid)),
      };
    },

    async overview({ gameName, tagLine }) {
      const account = await riot.account(gameName, tagLine);
      if (!account) throw notFound(gameName, tagLine);
      return overviewOf(account.puuid);
    },

    async details({ gameName, tagLine }) {
      const account = await riot.account(gameName, tagLine);
      if (!account) return null;
      const { puuid } = account;

      const championMasteriesPromise = riot
        .mastery(puuid)
        .then((list) => (list ?? []).map(toChampionMastery))
        .catch((err) => (warn('Mastery fetch error')(err), [] as ChampionMastery[]));
      const activeGamePromise = riot.activeGame(puuid)
        .then((game) => (game ? toActiveGame(game, puuid) : null))
        .catch((err) => (warn('Active game fetch error')(err), null));

      let matches: MatchHistory[] = [];
      try {
        const matchIds = (await riot.matchIds(puuid)) ?? [];
        const histories = await Promise.all(matchIds.map(async matchId => {
          try {
            const match = await riot.match(matchId);
            return match && toMatchHistory(matchId, match, puuid);
          } catch (err) {
            warn(`Failed to fetch match detail ${matchId}`)(err);
            return null;
          }
        }));
        matches = histories.filter((history): history is MatchHistory => history !== null);
      } catch (err) {
        warn('Match list fetch error')(err);
      }

      const [championMasteries, activeGame] = await Promise.all([championMasteriesPromise, activeGamePromise]);

      return { championMasteries, matches, activeGame };
    },
  };
}
