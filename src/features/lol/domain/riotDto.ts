// 이 앱이 사용하는 Riot 응답 필드만 정의한다 (전체 스키마가 아님).
export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface SummonerDto {
  id: string;
  summonerLevel: number;
  profileIconId: number;
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MasteryDto {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export interface ParticipantDto {
  puuid?: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
  championName?: string;
  championId?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  win?: boolean;
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
  goldEarned?: number;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
}

export interface MatchDto {
  info?: {
    gameMode?: string;
    gameDuration?: number;
    gameCreation?: number;
    participants?: ParticipantDto[];
  };
}

export interface SpectatorParticipantDto {
  puuid: string;
  teamId: number;
  championId: number;
  summonerName?: string;
  riotId?: string;
}

export interface SpectatorDto {
  gameId: number;
  gameLength: number;
  gameStartTime: number;
  mapId: number;
  gameMode: string;
  participants: SpectatorParticipantDto[];
}
