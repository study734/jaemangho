export interface SummonerInfo {
  id: string;
  puuid: string;
  name: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
}

export interface LeagueEntry {
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';
  tier: string; // 'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'
  rank: string; // 'I', 'II', 'III', 'IV'
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MatchPlayer {
  gameName: string;
  tagLine: string;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  totalMinionsKilled: number;
  goldEarned: number;
  itemIds: number[];
}

export interface MatchHistory {
  matchId: string;
  gameMode: string; // 'CLASSIC', 'ARAM', etc.
  gameDuration: number; // in seconds
  gameCreation: number; // timestamp
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  cs: number;
  gold: number;
  items: number[];
  allPlayers: MatchPlayer[];
}

export interface ActiveGame {
  gameId: number;
  gameLength: number; // in seconds
  gameStartTime: number; // timestamp
  championName: string;
  mapId: number;
  gameMode: string;
  teamPlayers: {
    gameName: string;
    tagLine: string;
    championName: string;
    isAlly: boolean;
  }[];
}

export interface ChampionMastery {
  championId: number;
  championName: string;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export interface Member {
  id: string; // Unique GUID or gameName#tagLine
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  activeGame: ActiveGame | null;
  matches: MatchHistory[];
  championMasteries?: ChampionMastery[];
}

export interface SynergyStats {
  duoName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKda: string;
}
