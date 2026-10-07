import type React from 'react';
import { useState, useId } from 'react';
import type { Member } from '../types';
import { SummonerPreview } from './SummonerPreview';
import { SummonerStatsFields, type SummonerStats } from './SummonerStatsFields';
type NewSummoner = Omit<Member, 'id' | 'matches' | 'activeGame'>;
export function AddSummonerForm({ onAddMember, onSearchMember, onComplete }: {
  onAddMember: (member: NewSummoner) => void;
  onSearchMember: (name: string, tag: string) => Promise<NewSummoner>;
  onComplete: () => void;
}) {
  const nameId = useId();
  const tagId = useId();
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Search & Preview state
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedProfile, setSearchedProfile] = useState<Omit<Member, 'id' | 'matches' | 'activeGame'> | null>(null);
  const [stats, setStats] = useState<SummonerStats>({ tier: 'GOLD', rank: 'I', leaguePoints: 0, summonerLevel: 150, wins: 50, losses: 50 });
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName.trim() || !tagLine.trim()) {
      alert('소환사 이름과 태그라인을 입력해 주세요.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchedProfile(null);
    try {
      const profile = await onSearchMember(gameName.trim(), tagLine.trim());
      setSearchedProfile(profile);
    }
    catch (err) {
      console.error(err);
      setSearchError(err instanceof Error ? err.message : '검색 실패');
    }
    finally {
      setIsSearching(false);
    }
  };
  // Handler to confirm recruiting searched member
  const handleConfirmAdd = () => {
    if (searchedProfile) {
      onAddMember(searchedProfile);
      // Reset form
      setGameName('');
      setTagLine('');
      setSearchedProfile(null);
      onComplete();
    }
  };
  // Handler to add manually via advanced settings
  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName.trim() || !tagLine.trim()) {
      alert('소환사 이름과 태그라인을 입력해 주세요.');
      return;
    }
    onAddMember({
      gameName: gameName.trim(),
      tagLine: tagLine.trim().toUpperCase(),
      ...stats,
      profileIconId: Math.floor(Math.random() * 1000) + 1, // random icon
    });
    // Reset form
    setGameName('');
    setTagLine('');
    setStats({ tier: 'GOLD', rank: 'I', leaguePoints: 0, summonerLevel: 150, wins: 50, losses: 50 });
    onComplete();
    setSearchedProfile(null);
  };
  return (<div className="card-feature" style={styles.addForm}>
    <h3 className="heading-3" style={{ marginBottom: '20px', color: '#00ed64' }}>
      라이엇 소환사 검색 및 추가
    </h3>

    <form onSubmit={handleSearch} style={styles.formRow} className="responsive-form-grid">
      <div style={styles.formGroup}>
        <label htmlFor={nameId} style={styles.label}>소환사명</label>
        <input id={nameId} required disabled={isSearching} type="text" className="text-input" placeholder="예: Faker" value={gameName} onChange={e => {
          setGameName(e.target.value);
          setSearchedProfile(null);
          setSearchError(null);
        }} />
      </div>
      <div style={styles.formGroup}>
        <label htmlFor={tagId} style={styles.label}>태그라인</label>
        <input id={tagId} required disabled={isSearching} type="text" className="text-input" placeholder="예: KR1" value={tagLine} onChange={e => {
          setTagLine(e.target.value);
          setSearchedProfile(null);
          setSearchError(null);
        }} />
      </div>
      <div style={{ ...styles.formGroup, display: 'flex', alignItems: 'flex-end' }}>
        <button type="submit" className="btn btn-secondary" style={{
          width: '100%',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderColor: '#00ed64',
          color: '#00ed64',
          backgroundColor: 'transparent'
        }} disabled={isSearching}>
          {isSearching ? (<>
            <span className="pulse-indicator" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ed64', marginRight: '4px' }} />
            조회 중...
          </>) : (<>🔍 소환사 검색 및 검증</>)}
        </button>
      </div>
    </form>

    {searchError && (<div role="alert" style={{ color: 'var(--accent-orange)', fontSize: '13px', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>⚠️</span> {searchError}
    </div>)}

    {/* Searched Summoner Preview Card */}
    {searchedProfile && <SummonerPreview profile={searchedProfile} onRetry={() => setSearchedProfile(null)} onConfirm={handleConfirmAdd} />}

    <div style={{ marginTop: '8px', marginBottom: '4px' }}>
      <button type="button" className="btn-link" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? '▴ 상세 정보 설정 숨기기' : '▾ 상세 정보 직접 입력 (티어, 레벨, 전적 커스텀 등록)'}
      </button>
    </div>

    {showAdvanced && (<form onSubmit={handleSubmitManual}>
      <SummonerStatsFields variant="register" value={stats} onChange={setStats} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button type="submit" className="btn btn-primary" style={{ height: '44px', padding: '0 24px', fontSize: '13px' }}>
          직접 입력한 정보로 추가
        </button>
      </div>
    </form>)}
  </div>);
}
const styles = {
  addForm: {
    backgroundColor: '#0b2a38',
    border: '1px solid #1c4558',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    padding: '24px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#a8b3bc',
  }
} satisfies Record<string, React.CSSProperties>;
