import { useState, useEffect, useContext, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import {
  Dashboard, MasteryShowcase, Settings, SquadManager, SynergyAnalyzer,
  INITIAL_MEMBERS, createLol, rosterApi, summarizeRoster, toMember,
  type Member, type Overview, type Summoner,
} from './features/lol';
import { MeContext } from './auth';
import { AdminDashboard } from './components/AdminDashboard';
import './App.css';

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

  // Riot 데이터 접근은 LolData 모듈이 맡는다. 여기서는 결과를 화면 상태에 반영만 한다.
  const lol = useMemo(() => createLol(apiKey), [apiKey]);

  // 목록 전체(또는 한 명)의 기본 정보(레벨/아이콘/랭크)를 갱신한다
  const fetchRealRiotData = async (targetMember?: Member) => {
    if (import.meta.env.DEV && !apiKey) {
      alert('로컬 개발 테스트를 위해 Riot API Key를 설정 탭에서 입력해 주세요.');
      return;
    }

    setIsLoadingRealData(true);
    setApiError(null);

    const overviews: { [memberId: string]: Overview } = {};
    await Promise.all((targetMember ? [targetMember] : members).map(async (member) => {
      try {
        overviews[member.id] = await lol.overview(member);
      } catch (err) {
        // 에러를 UI에 띄우지 않고 조용히 넘어감 (Silent Failure)
        console.warn(`Failed to fetch real data for ${member.gameName}:`, err);
      }
    }));

    setMembers(prev => prev.map(m => (overviews[m.id] ? { ...m, ...overviews[m.id] } : m)));
    setIsLoadingRealData(false);
  };

  // 상세 화면용 정보(숙련도/최근 매치/실시간 게임)를 클릭 시 불러온다
  const fetchMemberDetails = async (targetMember: Member) => {
    if (import.meta.env.DEV && !apiKey) return;
    try {
      const details = await lol.details(targetMember);
      if (details) setMembers(prev => prev.map(m => (m.id === targetMember.id ? { ...m, ...details } : m)));
    } catch (err) {
      console.warn(`Lazy load failed for ${targetMember.gameName}`, err);
    }
  };

  // 소환사 검색 & 미리보기
  const handleSearchMember = async (gameName: string, tagLine: string): Promise<Summoner> => {
    const trimmedName = gameName.trim();
    let trimmedTag = tagLine.trim().toUpperCase();
    if (trimmedTag.startsWith('#')) trimmedTag = trimmedTag.substring(1);

    if (!trimmedName || !trimmedTag) {
      throw new Error('소환사명과 태그라인을 둘 다 입력해 주세요.');
    }
    if (import.meta.env.DEV && !apiKey) {
      throw new Error('로컬 개발 테스트를 위해 Riot API Key를 설정 탭에서 입력해 주세요.');
    }
    return lol.lookup(trimmedName, trimmedTag);
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
        summary={summarizeRoster(members)}
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
          <AdminDashboard
            onDeleteMember={async (id) => {
              await rosterApi.remove(id);
              setMembers(prev => prev.filter(m => m.id !== id));
            }}
          />
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
