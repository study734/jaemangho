/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useContext } from 'react';
import { Sidebar } from './components/Sidebar';
import { riotGet, getCachedData } from './features/lol/api/riotClient';
import { Dashboard } from './features/lol/components/Dashboard';
import { SquadManager } from './features/lol/components/SquadManager';
import { SynergyAnalyzer } from './features/lol/components/SynergyAnalyzer';
import { Settings } from './features/lol/components/Settings';
import { MasteryShowcase } from './features/lol/components/MasteryShowcase';
import type { Member, ChampionMastery, MatchHistory, MatchPlayer, ActiveGame } from './features/lol/types';
import { INITIAL_MEMBERS } from './features/lol/mockData';
import { rosterApi, toMember } from './features/lol/api/roster';
import { MeContext } from './auth';
import { AdminDashboard } from './components/AdminDashboard';
import './App.css';

const CHAMPION_ID_MAP: { [key: number]: string } = {
  1: 'Annie', 2: 'Olaf', 3: 'Galio', 4: 'TwistedFate', 5: 'XinZhao', 6: 'Urgot', 7: 'Leblanc', 8: 'Vladimir', 9: 'Fiddlesticks', 10: 'Kayle',
  11: 'MasterYi', 12: 'Alistar', 13: 'Ryze', 14: 'Sion', 15: 'Sivir', 16: 'Soraka', 17: 'Teemo', 18: 'Tristana', 19: 'Warwick', 20: 'Nunu',
  21: 'MissFortune', 22: 'Ashe', 23: 'Tryndamere', 24: 'Jax', 25: 'Morgana', 26: 'Zilean', 27: 'Singed', 28: 'Evelynn', 29: 'Twitch', 30: 'Karthus',
  31: 'ChoGath', 32: 'Amumu', 33: 'Rammus', 34: 'Anivia', 35: 'Shaco', 36: 'DrMundo', 37: 'Sona', 38: 'Kassadin', 39: 'Irelia', 40: 'Janna',
  41: 'Gangplank', 42: 'Corki', 43: 'Karma', 44: 'Taric', 45: 'Veigar', 48: 'Trundle', 50: 'Swain', 51: 'Caitlyn', 53: 'Blitzcrank', 54: 'Malphite',
  55: 'Katarina', 56: 'Nocturne', 57: 'Maokai', 58: 'Renekton', 59: 'JarvanIV', 60: 'Elise', 61: 'Orianna', 62: 'Wukong', 63: 'Brand', 64: 'LeeSin',
  67: 'Vayne', 68: 'Rumble', 69: 'Cassiopeia', 72: 'Skarner', 74: 'Heimerdinger', 75: 'Nasus', 76: 'Nidalee', 77: 'Udyr', 78: 'Poppy', 79: 'Gragas',
  80: 'Pantheon', 81: 'Ezreal', 82: 'Mordekaiser', 83: 'Yorick', 84: 'Akali', 85: 'Kennen', 86: 'Garen', 89: 'Leona', 90: 'Malzahar', 91: 'Talon',
  92: 'Riven', 96: 'KogMaw', 98: 'Shen', 99: 'Lux', 101: 'Xerath', 102: 'Shyvana', 103: 'Ahri', 104: 'Graves', 105: 'Fizz', 106: 'Volibear',
  107: 'Rengar', 110: 'Varus', 111: 'Nautilus', 112: 'Viktor', 113: 'Sejuani', 114: 'Fiora', 115: 'Ziggs', 117: 'Lulu', 119: 'Draven', 120: 'Hecarim',
  121: 'Khazix', 122: 'Darius', 126: 'Jayce', 127: 'Lissandra', 131: 'Diana', 133: 'Quinn', 134: 'Syndra', 136: 'AurelionSol', 141: 'Kayn', 142: 'Zoe',
  143: 'Zyra', 145: 'Kaisa', 147: 'Seraphine', 150: 'Gnar', 154: 'Zac', 157: 'Yasuo', 161: 'VelKoz', 163: 'Taliyah', 164: 'Camille', 166: 'Akshan',
  200: 'BelVeth', 201: 'Braum', 202: 'Jinx', 203: 'Kindred', 222: 'Jinx', 223: 'Lucian', 234: 'Viego', 235: 'Senna', 236: 'Lucian', 238: 'Zed',
  240: 'Kled', 245: 'Ekko', 246: 'Qiyana', 254: 'Vi', 266: 'Aatrox', 267: 'Nami', 268: 'Azir', 350: 'Yuumi', 360: 'Samira', 412: 'Thresh',
  420: 'Illaoi', 421: 'RekSai', 427: 'Ivern', 429: 'Kalista', 432: 'Bard', 497: 'Rakan', 498: 'Xayah', 516: 'Ornn', 517: 'Sylas', 518: 'Neeko',
  523: 'Aphelios', 526: 'Rell', 555: 'Pyke', 777: 'Yone', 875: 'Sett', 876: 'Lillia', 887: 'Gwen', 888: 'Renata', 895: 'Nilah', 897: 'KsanTe',
  902: 'Milio', 950: 'Naafiri', 910: 'Hwei', 901: 'Briar'
};

function App() {
  // 크루원 명단은 서버 DB(개발 환경은 localStorage)에서 불러온다
  const [members, setMembers] = useState<Member[]>([]);
  const [rosterReady, setRosterReady] = useState(false);

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const isAdmin = useContext(MeContext)?.isAdmin === true;

  // 키는 로컬 개발(vite 프록시)에서만 클라이언트가 가진다. 배포 환경은 서버(/api/riot)가 환경변수 RIOT_API_KEY를 쓴다.
  const [apiKey, setApiKey] = useState<string>(() =>
    import.meta.env.DEV
      ? (import.meta.env.VITE_RIOT_API_KEY as string) || localStorage.getItem('jaemangho_api_key') || ''
      : ''
  );
  const canFetch = !import.meta.env.DEV || !!apiKey;

  const [isLoadingRealData, setIsLoadingRealData] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    rosterApi.list()
      .then((list) => {
        setMembers(list.map(toMember));
        setRosterReady(true);
      })
      .catch(() => setApiError('소환사 목록을 불러오지 못했습니다. 새로고침해 주세요.'));
  }, []);

  // 저장 실패(중복 Riot ID, 세션 만료 등) 시 서버 기준으로 명단을 다시 맞춘다
  const persist = (p: Promise<unknown>) =>
    p.catch(async () => {
      alert('저장하지 못했습니다. 명단을 서버 기준으로 다시 불러옵니다.');
      const list = await rosterApi.list();
      setMembers((prev) => list.map((e) => prev.find((m) => m.id === e.id) ?? toMember(e)));
    });

  useEffect(() => {
    if (import.meta.env.DEV) localStorage.setItem('jaemangho_api_key', apiKey);
    else localStorage.removeItem('jaemangho_api_key'); // 이전 버전이 저장해 둔 키 제거
  }, [apiKey]);

  // REAL RIOT API FETCHING ENGINE
  const fetchRealRiotData = async (targetMember?: Member) => {
    const isDev = import.meta.env.DEV;
    if (isDev && !apiKey) {
      alert('로컬 개발 테스트를 위해 Riot API Key를 설정 탭에서 입력해 주세요.');
      return;
    }

    setIsLoadingRealData(true);
    setApiError(null);

    const membersToFetch = targetMember ? [targetMember] : members;
    const fetchedStats: { [key: string]: { 
      level: number; 
      iconId: number; 
      tier: string; 
      rank: string; 
      lp: number; 
      wins: number; 
      losses: number;
    } } = {};

    const riotKrUrl = (path: string, params: string) =>
      isDev
        ? `/riot-kr${path}?api_key=${apiKey}${params ? '&' + params : ''}`
        : `/api/riot?region=kr&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

    const riotAsiaUrl = (path: string, params: string) =>
      isDev
        ? `/riot-asia${path}?api_key=${apiKey}${params ? '&' + params : ''}`
        : `/api/riot?region=asia&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

    // 병렬 큐로 모두 던져도 riotClient 내부 큐가 초당 6.6회로 제한해줌
    await Promise.all(membersToFetch.map(async (member) => {
      try {
        const exactName = member.gameName;
        const puuidCacheKey = `puuid_${exactName}_${member.tagLine}`;

        const buildAccountUrl = (name: string) =>
          riotAsiaUrl(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(member.tagLine)}`, '');

        let accountData = await riotGet<{ puuid: string }>(buildAccountUrl(exactName), puuidCacheKey, true);

        if (!accountData && exactName.includes(' ')) {
          const stripped = exactName.replace(/\s+/g, '');
          accountData = await riotGet<{ puuid: string }>(buildAccountUrl(stripped), `puuid_${stripped}_${member.tagLine}`, true);
        }

        if (!accountData && !exactName.includes(' ') && exactName.length > 1) {
          const spaced = exactName.charAt(0) + ' ' + exactName.slice(1);
          accountData = await riotGet<{ puuid: string }>(buildAccountUrl(spaced), `puuid_${spaced}_${member.tagLine}`, true);
        }

        if (!accountData) {
          throw new Error(`존재하지 않는 Riot ID입니다 (HTTP 404). 소환사명(${member.gameName})과 태그(#${member.tagLine})에 오타가 없는지 확인해 주세요.`);
        }

        const puuid = accountData.puuid;

        // 2. Get Summoner Details (Summoner-V4)
        const summonerUrl = riotKrUrl(`/lol/summoner/v4/summoners/by-puuid/${puuid}`, '');
        const summonerData = await riotGet<{ id: string; summonerLevel: number; profileIconId: number }>(summonerUrl, `summoner_${puuid}`, true);
        
        if (!summonerData) throw new Error('소환사 상세조회 실패');


        const level = summonerData.summonerLevel;
        const iconId = summonerData.profileIconId;

        // 3. Get Ranked Entries (League-V4)
        const leagueUrl = riotKrUrl(`/lol/league/v4/entries/by-puuid/${puuid}`, '');
        const leagueData = await riotGet<{ queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number; }[]>(leagueUrl, `league_${puuid}`);
        
        const soloEntry = leagueData?.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') || leagueData?.[0];

        // 기초 정보만 세팅. 매치 기록과 실시간 게임은 클릭 시 로딩(Lazy Loading)
        fetchedStats[member.id] = {
          level,
          iconId,
          tier: soloEntry ? soloEntry.tier : 'UNRANKED',
          rank: soloEntry ? soloEntry.rank : '',
          lp: soloEntry ? soloEntry.leaguePoints : 0,
          wins: soloEntry ? soloEntry.wins : 0,
          losses: soloEntry ? soloEntry.losses : 0,
        };
      } catch (err) {
        console.warn(`Failed to fetch real data for ${member.gameName}:`, err);
        // 에러를 UI에 띄우지 않고 조용히 넘어감 (Silent Failure)
      }
    }));

    setMembers(prev => prev.map(m => {
      const stats = fetchedStats[m.id];
      if (stats) {
        return {
          ...m,
          summonerLevel: stats.level,
          profileIconId: stats.iconId,
          tier: stats.tier,
          rank: stats.rank,
          leaguePoints: stats.lp,
          wins: stats.wins,
          losses: stats.losses,
        };
      }
      return m;
    }));

    setIsLoadingRealData(false);
  };

  // LAZY LOADING DETAILED DATA FOR A SINGLE MEMBER
  const fetchMemberDetails = async (targetMember: Member) => {
    const isDev = import.meta.env.DEV;
    if (isDev && !apiKey) return;

    const riotKrUrl = (path: string, params: string) =>
      isDev ? `/riot-kr${path}?api_key=${apiKey}${params ? '&' + params : ''}`
            : `/api/riot?region=kr&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

    const riotAsiaUrl = (path: string, params: string) =>
      isDev ? `/riot-asia${path}?api_key=${apiKey}${params ? '&' + params : ''}`
            : `/api/riot?region=asia&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

    try {
      // Get PUUID from Cache first (since we already fetched it in fetchRealRiotData)
      const exactName = targetMember.gameName;
      const puuidCacheKey = `puuid_${exactName}_${targetMember.tagLine}`;
      const accountData = getCachedData<{ puuid: string }>(puuidCacheKey, true);
      let puuid = accountData?.puuid;

      if (!puuid) {
        // Fallback fetch if not cached (should rarely happen if global sync ran)
        const res = await riotGet<{ puuid: string }>(riotAsiaUrl(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(exactName)}/${encodeURIComponent(targetMember.tagLine)}`, ''), puuidCacheKey, true);
        if (res) puuid = res.puuid;
      }
      
      if (!puuid) return;

      // 4. Get Top 3 Champion Masteries (Champion-Mastery-V4)
      let topMasteries: ChampionMastery[] = [];
      try {
        const masteryUrl = riotKrUrl(`/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top`, 'count=3');
        const masteryData = await riotGet<{ championId: number; championLevel: number; championPoints: number; lastPlayTime: number; }[]>(masteryUrl, `mastery_${puuid}`);
        if (masteryData) {
          topMasteries = masteryData.map(m => ({
            championId: m.championId,
            championName: CHAMPION_ID_MAP[m.championId] || 'Ezreal',
            championLevel: m.championLevel,
            championPoints: m.championPoints,
            lastPlayTime: m.lastPlayTime
          }));
        }
      } catch (err) { console.warn('Mastery fetch error', err); }

      // 5. Get Real Recent 3 Matches (Match-V5)
      const realMatches: MatchHistory[] = [];
      try {
        const matchIdsUrl = riotAsiaUrl(`/lol/match/v5/matches/by-puuid/${puuid}/ids`, 'start=0&count=3');
        const matchIds = await riotGet<string[]>(matchIdsUrl, `matchids_${puuid}`);
        
        if (matchIds) {
          for (const matchId of matchIds) {
            try {
              const matchDetailUrl = riotAsiaUrl(`/lol/match/v5/matches/${matchId}`, '');
              const matchData = await riotGet<any>(matchDetailUrl, `match_${matchId}`, true); // Match is immutable
              
              if (matchData && matchData.info && matchData.info.participants) {
                const info = matchData.info;
                const playerPart = info.participants.find((p: any) => p.puuid === puuid) || info.participants[0];

                const allPlayersMapped: MatchPlayer[] = info.participants.map((p: any) => {
                  let pName = p.riotIdGameName || p.summonerName || '소환사';
                  let pTag = p.riotIdTagline || '';
                  if (!pTag && p.summonerName && p.summonerName.includes('#')) {
                    const parts = p.summonerName.split('#');
                    pName = parts[0];
                    pTag = parts[1] || '';
                  }
                  return {
                    gameName: pName,
                    tagLine: pTag,
                    championName: p.championName || 'Unknown',
                    championId: p.championId || 0,
                    kills: p.kills || 0,
                    deaths: p.deaths || 0,
                    assists: p.assists || 0,
                    win: !!p.win,
                    totalMinionsKilled: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
                    goldEarned: p.goldEarned || 0,
                    itemIds: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].filter((id: any) => id !== undefined && id !== null)
                  };
                });

                realMatches.push({
                  matchId,
                  gameMode: info.gameMode || 'CLASSIC',
                  gameDuration: info.gameDuration || 0,
                  gameCreation: info.gameCreation || Date.now(),
                  championName: playerPart.championName || 'Unknown',
                  kills: playerPart.kills || 0,
                  deaths: playerPart.deaths || 0,
                  assists: playerPart.assists || 0,
                  win: !!playerPart.win,
                  cs: (playerPart.totalMinionsKilled || 0) + (playerPart.neutralMinionsKilled || 0),
                  gold: playerPart.goldEarned || 0,
                  items: [playerPart.item0, playerPart.item1, playerPart.item2, playerPart.item3, playerPart.item4, playerPart.item5, playerPart.item6].filter((id: any) => id !== undefined && id !== null),
                  allPlayers: allPlayersMapped
                });
              }
            } catch (err) { console.warn(`Failed to fetch match detail ${matchId}`, err); }
          }
        }
      } catch (err) { console.warn('Match list fetch error', err); }

      // 6. Get Real Active Game (Spectator-V5)
      let realActiveGame: ActiveGame | null = null;
      try {
        const spectatorUrl = riotKrUrl(`/lol/spectator/v5/active-games/by-puuid/${puuid}`, '');
        const spectatorData = await riotGet<any>(spectatorUrl, `spectator_${puuid}`);
        if (spectatorData) {
          const playerPart = spectatorData.participants.find((p: any) => p.puuid === puuid);
          const playerTeamId = playerPart ? playerPart.teamId : 100;
          const playerChampId = playerPart ? playerPart.championId : 0;

          const teamPlayers = spectatorData.participants.map((p: any) => {
            let name = p.summonerName || 'Unknown';
            let tag = '';
            if (p.riotId) {
              const parts = p.riotId.split('#');
              name = parts[0];
              tag = parts[1] || '';
            }
            return {
              gameName: name,
              tagLine: tag,
              championName: CHAMPION_ID_MAP[p.championId] || 'Unknown',
              isAlly: p.teamId === playerTeamId
            };
          });

          realActiveGame = {
            gameId: spectatorData.gameId,
            gameLength: spectatorData.gameLength,
            gameStartTime: spectatorData.gameStartTime,
            championName: CHAMPION_ID_MAP[playerChampId] || 'Unknown',
            mapId: spectatorData.mapId,
            gameMode: spectatorData.gameMode,
            teamPlayers
          };
        }
      } catch (err) { console.warn('Active game fetch error', err); }

      // Update specific member
      setMembers(prev => prev.map(m => {
        if (m.id === targetMember.id) {
          return {
            ...m,
            championMasteries: topMasteries,
            matches: realMatches,
            activeGame: realActiveGame
          };
        }
        return m;
      }));
    } catch (err) {
      console.warn(`Lazy load failed for ${targetMember.gameName}`, err);
    }
  };

  // REAL OR MOCK SUMMONER SEARCH & PREVIEW UTILITY
  const handleSearchMember = async (gameName: string, tagLine: string): Promise<Omit<Member, 'id' | 'matches' | 'activeGame'>> => {
    const trimmedName = gameName.trim();
    let trimmedTag = tagLine.trim().toUpperCase();
    
    if (trimmedTag.startsWith('#')) {
      trimmedTag = trimmedTag.substring(1);
    }

    if (!trimmedName || !trimmedTag) {
      throw new Error('소환사명과 태그라인을 둘 다 입력해 주세요.');
    }

    const isDev = import.meta.env.DEV;
    if (isDev && !apiKey) {
      throw new Error('로컬 개발 테스트를 위해 Riot API Key를 설정 탭에서 입력해 주세요.');
    }

    const srKrUrl = (path: string, params: string) =>
      isDev
        ? `/riot-kr${path}?api_key=${apiKey}${params ? '&' + params : ''}`
        : `/api/riot?region=kr&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

    const srAsiaUrl = (path: string, params: string) =>
      isDev
        ? `/riot-asia${path}?api_key=${apiKey}${params ? '&' + params : ''}`
        : `/api/riot?region=asia&path=${encodeURIComponent(path)}${params ? '&' + params : ''}`;

    // 1. Resolve PUUID
    const buildSearchUrl = (name: string) =>
      srAsiaUrl(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(trimmedTag)}`, '');

    let accountData = await riotGet<{ puuid: string; gameName: string; tagLine: string }>(buildSearchUrl(trimmedName), `puuid_${trimmedName}_${trimmedTag}`, true);

    if (!accountData && trimmedName.includes(' ')) {
      const stripped = trimmedName.replace(/\s+/g, '');
      accountData = await riotGet(buildSearchUrl(stripped), `puuid_${stripped}_${trimmedTag}`, true);
    }

    if (!accountData && !trimmedName.includes(' ') && trimmedName.length > 1) {
      const spaced = trimmedName.charAt(0) + ' ' + trimmedName.slice(1);
      accountData = await riotGet(buildSearchUrl(spaced), `puuid_${spaced}_${trimmedTag}`, true);
    }

    if (!accountData) {
      throw new Error(`존재하지 않는 Riot ID입니다 (HTTP 404). 소환사명(${trimmedName})과 태그(#${trimmedTag})에 오타가 없는지 확인해 주세요.`);
    }

    const puuid = accountData.puuid;
    const finalGameName = accountData.gameName || trimmedName;
    const finalTagLine = accountData.tagLine || trimmedTag;

    const summonerData = await riotGet<{ id: string; summonerLevel: number; profileIconId: number }>(
      srKrUrl(`/lol/summoner/v4/summoners/by-puuid/${puuid}`, ''), `summoner_${puuid}`, true
    );
    if (!summonerData) throw new Error('소환사 상세조회 실패');


    const level = summonerData.summonerLevel;
    const iconId = summonerData.profileIconId;

    const leagueData = await riotGet<{ queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number; }[]>(
      srKrUrl(`/lol/league/v4/entries/by-puuid/${puuid}`, ''), `league_${puuid}`
    );
    const soloEntry = leagueData?.find(e => e.queueType === 'RANKED_SOLO_5x5') ?? leagueData?.[0];

    return {
      gameName: finalGameName,
      tagLine: finalTagLine,
      summonerLevel: level,
      profileIconId: iconId,
      tier: soloEntry ? soloEntry.tier : 'UNRANKED',
      rank: soloEntry ? soloEntry.rank : '',
      leaguePoints: soloEntry ? soloEntry.leaguePoints : 0,
      wins: soloEntry ? soloEntry.wins : 0,
      losses: soloEntry ? soloEntry.losses : 0,
    };
  };

  // Automatically fetch real Riot API data when toggling to Real Mode
  // Automatically fetch real Riot API data when API Key is loaded/provided
  useEffect(() => {
    if (canFetch && rosterReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRealRiotData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, rosterReady]);

  // Add Member Handler
  const handleAddMember = (newMemberData: Omit<Member, 'id' | 'matches' | 'activeGame'>) => {
    // Check for duplicate Riot ID
    const duplicate = members.some(
      m => m.gameName.toLowerCase() === newMemberData.gameName.toLowerCase() && 
           m.tagLine.toLowerCase() === newMemberData.tagLine.toLowerCase()
    );

    if (duplicate) {
      alert('이미 목록에 있는 Riot ID입니다.');
      return;
    }

    const newId = Math.random().toString(36).substring(2, 9);
    
    // Create base member (No mock matches, no mock masteries. Totally empty, pending real API fetch)
    const newMember: Member = {
      ...newMemberData,
      id: newId,
      summonerLevel: 0,
      profileIconId: 29, // Default profile icon
      tier: 'UNRANKED',
      rank: '',
      leaguePoints: 0,
      wins: 0,
      losses: 0,
      activeGame: null,
      matches: []
    };

    setMembers(prev => [newMember, ...prev]);
    persist(rosterApi.add({ id: newId, gameName: newMember.gameName, tagLine: newMember.tagLine }));

    // Trigger immediate real API background fetch to populate actual data
    if (canFetch) {
      setTimeout(() => {
        fetchRealRiotData(newMember);
      }, 50);
    }
  };

  // Remove Member Handler
  const handleRemoveMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    persist(rosterApi.remove(id));
  };

  // Update Member Handler (used for edits)
  const handleUpdateMember = (updatedMember: Member) => {
    setMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
    persist(rosterApi.update({ id: updatedMember.id, gameName: updatedMember.gameName, tagLine: updatedMember.tagLine }));
  };

  // Reset (로컬 개발 전용: 배포 환경은 명단이 크루 공용 DB라 초기화 UI를 숨긴다)
  const handleResetMembers = () => {
    localStorage.removeItem('jaemangho_roster');
    setMembers(INITIAL_MEMBERS);
  };

  return (
    <div style={styles.appContainer}>
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        members={members} 
        isAdmin={isAdmin}
      />

      {/* Main Content Pane */}
      <main style={styles.mainPane}>
        {/* Dynamic Loading Overlay for Real API */}
        {isLoadingRealData && (
          <div style={styles.loadingBanner}>
            <span className="pulse-indicator" style={{ marginRight: '8px' }} />
            라이엇 서버로부터 소환사들의 최신 전적을 받아오고 있습니다...
          </div>
        )}

        {/* Dynamic API Error Banner */}
        {apiError && (
          <div style={styles.errorBanner}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
              <span>⚠️</span>
              <span>{apiError}</span>
            </div>
            <button 
              className="btn" 
              style={styles.errorCloseBtn} 
              onClick={() => setApiError(null)}
            >
              닫기
            </button>
          </div>
        )}

        {/* Sync Button for Real API Mode */}
        {canFetch && !isLoadingRealData && (
          <div style={styles.syncRow}>
            <button 
              className="btn btn-secondary" 
              style={styles.syncBtn} 
              onClick={() => fetchRealRiotData()}
            >
              🔄 실시간 데이터 강제 동기화
            </button>
          </div>
        )}

        {/* Render Selected Tab */}
        {activeTab === 'dashboard' && (
          <Dashboard 
            members={members} 
            fetchMemberDetails={fetchMemberDetails}
          />
        )}

        {activeTab === 'squad' && (
          <SquadManager 
            members={members}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onUpdateMember={handleUpdateMember}
            onSearchMember={handleSearchMember}
          />
        )}

        {activeTab === 'synergy' && (
          <SynergyAnalyzer 
            members={members} 
          />
        )}

        {activeTab === 'mastery' && (
          <MasteryShowcase 
            members={members} 
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminDashboard onMemberDeleted={(id) => setMembers(prev => prev.filter(m => m.id !== id))} />
        )}

        {activeTab === 'settings' && (
          <Settings 
            apiKey={apiKey}
            setApiKey={setApiKey}
            onResetMembers={handleResetMembers}
          />
        )}
      </main>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
  },
  mainPane: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: '#0b2a38',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  loadingBanner: {
    backgroundColor: '#ffb703',
    color: '#001e2b',
    padding: '8px 24px',
    textAlign: 'center' as const,
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  syncRow: {
    padding: '16px 32px 0 32px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  syncBtn: {
    fontSize: '12.5px',
    padding: '6px 14px',
  },
  errorBanner: {
    backgroundColor: '#fff8e0', // MongoDB warning bg
    color: '#946f3f', // MongoDB warning text
    padding: '12px 24px',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1.5px solid #fa6e39', // warning accent border
    zIndex: 5,
  },
  errorCloseBtn: {
    fontSize: '11px',
    padding: '4px 10px',
    color: '#946f3f',
    borderColor: '#946f3f',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: '1px solid #946f3f',
    borderRadius: '4px',
    marginLeft: '16px',
    fontWeight: 600,
  }
};

export default App;
