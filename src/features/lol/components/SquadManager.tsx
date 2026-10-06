'use client';

import { RiotImage } from './RiotImage';
import React, { useState } from 'react';
import type { Member } from '../types';
import { getTierColor, getTierLabelKR } from '../mockData';

interface SquadManagerProps {
  members: Member[];
  onAddMember: (newMember: Omit<Member, 'id' | 'matches' | 'activeGame'>) => void;
  onRemoveMember: (id: string) => void;
  onUpdateMember: (member: Member) => void;
  onSearchMember: (gameName: string, tagLine: string) => Promise<Omit<Member, 'id' | 'matches' | 'activeGame'>>;
}

export const SquadManager: React.FC<SquadManagerProps> = ({
  members,
  onAddMember,
  onRemoveMember,
  onUpdateMember,
  onSearchMember
}) => {
  // Add Member form state
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [tier, setTier] = useState('GOLD');
  const [rank, setRank] = useState('I');
  const [lp, setLp] = useState(0);
  const [level, setLevel] = useState(150);
  const [wins, setWins] = useState(50);
  const [losses, setLosses] = useState(50);
  const [isAdding, setIsAdding] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Search & Preview state
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedProfile, setSearchedProfile] = useState<Omit<Member, 'id' | 'matches' | 'activeGame'> | null>(null);

  // Edit Member state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState('GOLD');
  const [editRank, setEditRank] = useState('I');
  const [editLp, setEditLp] = useState(0);
  const [editWins, setEditWins] = useState(50);
  const [editLosses, setEditLosses] = useState(50);
  const [editLevel, setEditLevel] = useState(150);

  // Handler to search summoner
  const handleSearch = async (e: React.MouseEvent) => {
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
    } catch (err) {
      console.error(err);
      setSearchError(err instanceof Error ? err.message : '검색 실패');
    } finally {
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
      setIsAdding(false);
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
      tier,
      rank,
      leaguePoints: Number(lp),
      summonerLevel: Number(level),
      profileIconId: Math.floor(Math.random() * 1000) + 1, // random icon
      wins: Number(wins),
      losses: Number(losses),
    });

    // Reset form
    setGameName('');
    setTagLine('');
    setTier('GOLD');
    setRank('I');
    setLp(0);
    setLevel(150);
    setWins(50);
    setLosses(50);
    setIsAdding(false);
    setSearchedProfile(null);
  };

  const startEditing = (member: Member) => {
    setEditingId(member.id);
    setEditTier(member.tier);
    setEditRank(member.rank);
    setEditLp(member.leaguePoints);
    setEditWins(member.wins);
    setEditLosses(member.losses);
    setEditLevel(member.summonerLevel);
  };

  const handleUpdate = (member: Member) => {
    onUpdateMember({
      ...member,
      tier: editTier,
      rank: editRank,
      leaguePoints: Number(editLp),
      wins: Number(editWins),
      losses: Number(editLosses),
      summonerLevel: Number(editLevel)
    });
    setEditingId(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header} className="squad-heading">
        <div>
          <h2 className="heading-1" style={styles.title}>소환사 관리</h2>
          <p className="subtitle">
            보고 싶은 소환사를 검색해 목록에 추가하면 대시보드에서 전적과 실시간 상태를 확인할 수 있습니다. 목록은 로그인한 모두에게 함께 보입니다.
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => {
            setIsAdding(!isAdding);
            setSearchedProfile(null);
            setSearchError(null);
            setGameName('');
            setTagLine('');
          }}
        >
          {isAdding ? '닫기' : '소환사 추가'}
        </button>
      </header>

      {/* Add Member Panel */}
      {isAdding && (
        <div className="card-feature" style={styles.addForm}>
          <h3 className="heading-3" style={{ marginBottom: '20px', color: '#00ed64' }}>
            라이엇 소환사 검색 및 추가
          </h3>
          
          <div style={styles.formRow} className="responsive-form-grid">
            <div style={styles.formGroup}>
              <label style={styles.label}>소환사명</label>
              <input 
                type="text" 
                className="text-input" 
                placeholder="예: Faker"
                value={gameName}
                onChange={e => {
                  setGameName(e.target.value);
                  setSearchedProfile(null);
                  setSearchError(null);
                }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>태그라인</label>
              <input 
                type="text" 
                className="text-input" 
                placeholder="예: KR1"
                value={tagLine}
                onChange={e => {
                  setTagLine(e.target.value);
                  setSearchedProfile(null);
                  setSearchError(null);
                }}
              />
            </div>
            <div style={{ ...styles.formGroup, display: 'flex', alignItems: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ 
                  width: '100%', 
                  height: '44px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px', 
                  borderColor: '#00ed64', 
                  color: '#00ed64',
                  backgroundColor: 'transparent'
                }}
                onClick={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? (
                  <>
                    <span className="pulse-indicator" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ed64', marginRight: '4px' }} />
                    조회 중...
                  </>
                ) : (
                  <>🔍 소환사 검색 및 검증</>
                )}
              </button>
            </div>
          </div>

          {searchError && (
            <div style={{ color: '#fa6e39', fontSize: '13px', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚠️</span> {searchError}
            </div>
          )}

          {/* Searched Summoner Preview Card */}
          {searchedProfile && (
            <div className="card-feature" style={styles.previewCard}>
              <h4 style={{ color: '#00ed64', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.8px' }}>
                ✓ 계정 확인 완료
              </h4>
              
              <div style={styles.previewContainer}>
                <RiotImage
                  kind="profileicon" asset={searchedProfile.profileIconId}
                  alt={`${searchedProfile.gameName} 프로필`}
                  style={styles.previewIcon} 
                />
                <div style={styles.previewMainInfo}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <h3 style={styles.previewName}>{searchedProfile.gameName}</h3>
                    <span style={styles.previewTag}>#{searchedProfile.tagLine}</span>
                  </div>
                  <div style={styles.previewLevelBadge}>
                    Lv.{searchedProfile.summonerLevel}
                  </div>
                </div>

                <div style={styles.previewStats}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '80px' }}>
                    <span style={styles.previewLabel}>티어</span>
                    <span style={{ ...styles.previewValue, color: getTierColor(searchedProfile.tier) }}>
                      {getTierLabelKR(searchedProfile.tier)} {searchedProfile.tier !== 'MASTER' && searchedProfile.tier !== 'GRANDMASTER' && searchedProfile.tier !== 'CHALLENGER' ? searchedProfile.rank : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '60px' }}>
                    <span style={styles.previewLabel}>LP</span>
                    <span style={styles.previewValue}>{searchedProfile.leaguePoints} LP</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '100px' }}>
                    <span style={styles.previewLabel}>전적</span>
                    <span style={styles.previewValue}>
                      {searchedProfile.wins}승 {searchedProfile.losses}패 ({Math.round((searchedProfile.wins / (searchedProfile.wins + searchedProfile.losses)) * 100) || 50}%)
                    </span>
                  </div>
                </div>
              </div>

              {searchedProfile.championMasteries && searchedProfile.championMasteries.length > 0 && (
                <div style={styles.previewMasteryRow}>
                  <div style={styles.previewLabelMini}>주력 모스트 챔피언</div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {searchedProfile.championMasteries.map((m, idx) => (
                      <div key={idx} style={styles.previewMasteryItem}>
                        <RiotImage
                          kind="champion" asset={m.championName}
                          alt={m.championName}
                          style={styles.previewMasteryIcon}
                        />
                        <div style={{ fontSize: '11.5px', color: '#ffffff', fontWeight: 600 }}>{m.championName}</div>
                        <div style={{ fontSize: '10px', color: '#7c8c9a' }}>Lvl {m.championLevel}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={styles.previewActions}>
                <button 
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '10px 20px', fontSize: '13px' }}
                  onClick={() => setSearchedProfile(null)}
                >
                  다시 검색
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ flex: 2, padding: '10px 20px', fontWeight: 700, fontSize: '13px' }}
                  onClick={handleConfirmAdd}
                >
                  이 소환사 추가하기
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '8px', marginBottom: '4px' }}>
            <button 
              type="button" 
              className="btn-link" 
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▴ 상세 정보 설정 숨기기' : '▾ 상세 정보 직접 입력 (티어, 레벨, 전적 커스텀 등록)'}
            </button>
          </div>

          {showAdvanced && (
            <form onSubmit={handleSubmitManual}>
              <div style={styles.formRow} className="responsive-form-grid">
                <div style={styles.formGroup}>
                  <label style={styles.label}>소환사 레벨</label>
                  <input 
                    type="number" 
                    className="text-input" 
                    value={level}
                    onChange={e => setLevel(Number(e.target.value))}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>초기 티어</label>
                  <select className="text-input" style={styles.select} value={tier} onChange={e => setTier(e.target.value)}>
                    <option value="CHALLENGER">챌린저</option>
                    <option value="GRANDMASTER">그랜드마스터</option>
                    <option value="MASTER">마스터</option>
                    <option value="DIAMOND">다이아몬드</option>
                    <option value="EMERALD">에메랄드</option>
                    <option value="PLATINUM">플래이너</option>
                    <option value="GOLD">골드</option>
                    <option value="SILVER">실버</option>
                    <option value="BRONZE">브론즈</option>
                    <option value="IRON">아이언</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>세부 랭크</label>
                  <select className="text-input" style={styles.select} value={rank} onChange={e => setRank(e.target.value)}>
                    <option value="I">I</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                  </select>
                </div>
              </div>

              <div style={styles.formRow} className="responsive-form-grid">
                <div style={styles.formGroup}>
                  <label style={styles.label}>리그 포인트 (LP)</label>
                  <input 
                    type="number" 
                    className="text-input" 
                    value={lp}
                    onChange={e => setLp(Number(e.target.value))}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>승리 횟수</label>
                  <input 
                    type="number" 
                    className="text-input" 
                    value={wins}
                    onChange={e => setWins(Number(e.target.value))}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>패배 횟수</label>
                  <input 
                    type="number" 
                    className="text-input" 
                    value={losses}
                    onChange={e => setLosses(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" style={{ height: '44px', padding: '0 24px', fontSize: '13px' }}>
                  직접 입력한 정보로 추가
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Members Cards Grid */}
      <div style={styles.cardsGrid}>
        {members.map(member => {
          const isEditing = editingId === member.id;

          return (
            <div key={member.id} className="card-base" style={styles.memberCard}>
              
              {/* Member Profile Card Title */}
              <div style={styles.cardHeader}>
                <div style={styles.userBox}>
                  <RiotImage
                    kind="profileicon" asset={member.profileIconId}
                    alt={`${member.gameName} 프로필`}
                    style={styles.profileIcon} 
                  />
                  <div>
                    <h4 style={styles.userName}>{member.gameName}</h4>
                    <span style={styles.userTag}>#{member.tagLine}</span>
                  </div>
                </div>
                
                {!isEditing && (
                  <button 
                    style={styles.removeBtn} 
                    onClick={() => {
                      if (confirm(`${member.gameName}을(를) 목록에서 삭제하시겠습니까?\n(게임 계정에는 영향이 없고, 이 대시보드 목록에서만 사라집니다)`)) {
                        onRemoveMember(member.id);
                      }
                    }}
                    title="목록에서 삭제"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                  </button>
                )}
              </div>

              {/* Specs & Editing Panels */}
              {isEditing ? (
                <div style={styles.editSection}>
                  <div style={styles.editRow}>
                    <div style={styles.editCol}>
                      <label style={styles.miniLabel}>레벨</label>
                      <input 
                        type="number" 
                        className="text-input" 
                        style={styles.miniInput} 
                        value={editLevel}
                        onChange={e => setEditLevel(Number(e.target.value))}
                      />
                    </div>
                    <div style={styles.editCol}>
                      <label style={styles.miniLabel}>LP</label>
                      <input 
                        type="number" 
                        className="text-input" 
                        style={styles.miniInput} 
                        value={editLp}
                        onChange={e => setEditLp(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div style={styles.editRow}>
                    <div style={styles.editCol}>
                      <label style={styles.miniLabel}>티어</label>
                      <select className="text-input" style={styles.miniInput} value={editTier} onChange={e => setEditTier(e.target.value)}>
                        <option value="CHALLENGER">챌린저</option>
                        <option value="GRANDMASTER">그랜드마스터</option>
                        <option value="MASTER">마스터</option>
                        <option value="DIAMOND">다이아몬드</option>
                        <option value="EMERALD">에메랄드</option>
                        <option value="PLATINUM">플래티넘</option>
                        <option value="GOLD">골드</option>
                        <option value="SILVER">실버</option>
                        <option value="BRONZE">브론즈</option>
                        <option value="IRON">아이언</option>
                      </select>
                    </div>
                    <div style={styles.editCol}>
                      <label style={styles.miniLabel}>랭크</label>
                      <select className="text-input" style={styles.miniInput} value={editRank} onChange={e => setEditRank(e.target.value)}>
                        <option value="I">I</option>
                        <option value="II">II</option>
                        <option value="III">III</option>
                        <option value="IV">IV</option>
                      </select>
                    </div>
                  </div>

                  <div style={styles.editRow}>
                    <div style={styles.editCol}>
                      <label style={styles.miniLabel}>승리</label>
                      <input 
                        type="number" 
                        className="text-input" 
                        style={styles.miniInput} 
                        value={editWins}
                        onChange={e => setEditWins(Number(e.target.value))}
                      />
                    </div>
                    <div style={styles.editCol}>
                      <label style={styles.miniLabel}>패배</label>
                      <input 
                        type="number" 
                        className="text-input" 
                        style={styles.miniInput} 
                        value={editLosses}
                        onChange={e => setEditLosses(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div style={styles.editActionRow}>
                    <button className="btn btn-secondary" style={styles.editBtnCancel} onClick={() => setEditingId(null)}>
                      취소
                    </button>
                    <button className="btn btn-primary" style={styles.editBtnSave} onClick={() => handleUpdate(member)}>
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.statsSection}>
                  <div style={styles.statBox}>
                    <span style={styles.statLabel}>티어 스펙</span>
                    <span style={{ ...styles.statValue, color: getTierColor(member.tier) }}>
                      {getTierLabelKR(member.tier)} {member.tier !== 'MASTER' && member.tier !== 'GRANDMASTER' && member.tier !== 'CHALLENGER' ? member.rank : ''}
                    </span>
                  </div>
                  <div style={styles.statGrid}>
                    <div style={styles.statItem}>
                      <span style={styles.statLabelMini}>레벨</span>
                      <span style={styles.statValueMini}>{member.summonerLevel}</span>
                    </div>
                    <div style={styles.statItem}>
                      <span style={styles.statLabelMini}>포인트</span>
                      <span style={styles.statValueMini}>{member.leaguePoints} LP</span>
                    </div>
                    <div style={styles.statItem}>
                      <span style={styles.statLabelMini}>총 전적</span>
                      <span style={styles.statValueMini}>{member.wins}승 {member.losses}패</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary" style={styles.editBtn} onClick={() => startEditing(member)}>
                    정보 편집
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: 'var(--page-padding)',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    overflowY: 'auto' as const,
    minHeight: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1c4558',
    paddingBottom: '20px',
    gap: '16px',
  },
  title: {
    color: '#ffffff',
    letterSpacing: '-1px',
  },
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
  },
  select: {
    cursor: 'pointer',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
    gap: '24px',
    alignItems: 'start',
  },
  memberCard: {
    backgroundColor: '#001e2b',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #143747',
    paddingBottom: '12px',
  },
  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  profileIcon: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '1.5px solid #00ed64',
  },
  userName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
  },
  userTag: {
    fontSize: '12px',
    color: '#7c8c9a',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#ff4a4a',
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'opacity 0.2s',
    padding: '4px',
  },
  statsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #143747',
  },
  statLabel: {
    fontSize: '11px',
    color: '#7c8c9a',
    textTransform: 'uppercase' as const,
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 700,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    padding: '6px',
    borderRadius: '4px',
    border: '1px solid #143747',
  },
  statLabelMini: {
    fontSize: '10px',
    color: '#5c6c7a',
  },
  statValueMini: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#ffffff',
    marginTop: '2px',
  },
  editBtn: {
    width: '100%',
    padding: '8px',
    fontSize: '12.5px',
  },
  editSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  editRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  editCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  miniLabel: {
    fontSize: '11px',
    color: '#7c8c9a',
  },
  miniInput: {
    height: '36px',
    padding: '6px 10px',
    fontSize: '13px',
  },
  editActionRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
  },
  editBtnCancel: {
    flex: 1,
    padding: '8px',
    fontSize: '12.5px',
  },
  editBtnSave: {
    flex: 1,
    padding: '8px',
    fontSize: '12.5px',
  },

  // Preview Card Styles
  previewCard: {
    backgroundColor: '#001e2b',
    border: '1.5px solid #00ed64',
    padding: '24px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    marginTop: '16px',
  },
  previewContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap' as const,
    backgroundColor: 'rgba(0, 30, 43, 0.6)',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #143747',
  },
  previewIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    border: '2px solid #00ed64',
  },
  previewMainInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    flexGrow: 1,
  },
  previewName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  },
  previewTag: {
    fontSize: '13px',
    color: '#7c8c9a',
  },
  previewLevelBadge: {
    fontSize: '11.5px',
    color: '#00ed64',
    fontWeight: 600,
    backgroundColor: 'rgba(0, 237, 100, 0.1)',
    padding: '3px 8px',
    borderRadius: '4px',
    width: 'fit-content',
  },
  previewStats: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap' as const,
  },
  previewLabel: {
    fontSize: '10.5px',
    color: '#7c8c9a',
    textTransform: 'uppercase' as const,
  },
  previewValue: {
    fontSize: '13.5px',
    fontWeight: 700,
    color: '#ffffff',
    marginTop: '2px',
  },
  previewMasteryRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    borderTop: '1px solid rgba(28, 69, 88, 0.4)',
    paddingTop: '14px',
  },
  previewLabelMini: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#7c8c9a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  previewMasteryItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #143747',
    minWidth: '85px',
  },
  previewMasteryIcon: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    border: '1px solid #1c4558',
  },
  previewActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    borderTop: '1px solid rgba(28, 69, 88, 0.4)',
    paddingTop: '16px',
  }
};
