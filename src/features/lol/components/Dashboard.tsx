'use client';

import { RiotImage } from './RiotImage';
import React, { useState } from 'react';
import type { Member } from '../types';
import { getTierColor, getTierLabelKR, getTierOrder, getRankOrder } from '../mockData';

interface DashboardProps {
  members: Member[];
  fetchMemberDetails: (member: Member) => Promise<void>;
}

export const Dashboard: React.FC<DashboardProps> = ({ members, fetchMemberDetails }) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Member | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [now] = useState(() => Date.now());

  // Filter active games
  const activeGames = members.filter(m => m.activeGame !== null);

  // Sort members by Tier -> Rank -> LP
  const sortedMembers = [...members].sort((a, b) => {
    const tierDiff = getTierOrder(b.tier) - getTierOrder(a.tier);
    if (tierDiff !== 0) return tierDiff;
    
    const rankDiff = getRankOrder(b.rank) - getRankOrder(a.rank);
    if (rankDiff !== 0) return rankDiff;
    
    return b.leaguePoints - a.leaguePoints;
  });

  const getWinRate = (wins: number, losses: number) => {
    const total = wins + losses;
    if (total === 0) return '0%';
    return `${Math.round((wins / total) * 100)}%`;
  };

  const getKdaRatio = (k: number, d: number, a: number) => {
    if (d === 0) return 'Perfect';
    return ((k + a) / d).toFixed(2);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    const days = Math.floor(hrs / 24);
    return `${days}일 전`;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>대시보드</h2>
          <p className="subtitle" style={styles.subtitleText}>등록된 소환사들의 실시간 상태와 랭킹을 확인하세요.</p>
        </div>
      </header>

      {/* Grid: Active Games & Rankings */}
      <div className="dashboard-grid">
        
        {/* Left Column: Active Games (실시간 전투 현황) */}
        <section style={styles.leftColumn}>
          <div style={styles.sectionHeader}>
            <span className="pulse-indicator" style={{ marginRight: '8px' }} />
            <h3 className="heading-3">실시간 전투 현황</h3>
            <span className="badge-green-soft" style={{ marginLeft: '10px' }}>{activeGames.length}명 진행 중</span>
          </div>

          {activeGames.length === 0 ? (
            <div className="card-base" style={styles.emptyActiveCard}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4e5f6e" strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v6l4 2" />
              </svg>
              <h4 className="heading-5" style={{ marginTop: '12px', color: '#7c8c9a' }}>현재 게임 중인 소환사가 없습니다.</h4>
              <p className="body-sm" style={{ marginTop: '4px' }}>등록된 소환사가 게임을 시작하면 실시간 현황판이 활성화됩니다.</p>
            </div>
          ) : (
            <div style={styles.activeGamesList}>
              {activeGames.map(member => {
                const game = member.activeGame!;
                return (
                  <div key={member.id} className="card-feature-dark" style={styles.activeGameCard}>
                    <div className="glow-bg" />
                    
                    {/* Game Meta */}
                    <div style={styles.activeGameMeta}>
                      <div style={styles.activeGameUser}>
                        <RiotImage
                          kind="profileicon" asset={member.profileIconId}
                          alt={`${member.gameName} 프로필`}
                          style={styles.profileIconMini} 
                        />
                        <div>
                          <span style={styles.activeGameName}>{member.gameName}</span>
                          <span style={styles.activeGameTag}>#{member.tagLine}</span>
                        </div>
                      </div>
                      <div style={styles.activeGameTime}>
                        <span className="pulse-indicator" style={{ marginRight: '6px' }} />
                        <span style={styles.liveLabel}>LIVE</span>
                        <span style={styles.timeValue}>{formatDuration(game.gameLength)}</span>
                      </div>
                    </div>

                    {/* Champion & Spec */}
                    <div style={styles.activeGameContent}>
                      <div style={styles.champDisplay}>
                        <RiotImage
                          kind="champion" asset={game.championName}
                          alt={game.championName} 
                          style={styles.champPortraitLarge}
                        />
                        <div style={styles.champInfo}>
                          <span style={styles.champLabel}>플레이 챔피언</span>
                          <h4 style={styles.champName}>{game.championName}</h4>
                          <span style={styles.gameModeLabel}>솔로 랭크전 - 소환사의 협곡</span>
                        </div>
                      </div>

                      {/* Team Composition Summary */}
                      <div style={styles.teamsBox}>
                        <div style={styles.teamColumn}>
                          <div style={styles.teamTitleAlly}>아군 팀</div>
                          <div style={styles.teamPlayersList}>
                            {game.teamPlayers.filter(p => p.isAlly).map((p, idx) => (
                              <div key={idx} style={styles.activeTeamPlayer}>
                                <RiotImage
                                  kind="champion" asset={p.championName}
                                  alt={p.championName} 
                                  style={styles.champTiny}
                                />
                                <span style={p.gameName === member.gameName ? styles.highlightedAllyName : styles.teamPlayerName} title={p.gameName}>
                                  {p.gameName}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={styles.teamColumn}>
                          <div style={styles.teamTitleEnemy}>적군 팀</div>
                          <div style={styles.teamPlayersList}>
                            {game.teamPlayers.filter(p => !p.isAlly).map((p, idx) => (
                              <div key={idx} style={styles.activeTeamPlayer}>
                                <RiotImage
                                  kind="champion" asset={p.championName}
                                  alt={p.championName} 
                                  style={styles.champTiny}
                                />
                                <span style={styles.teamPlayerName} title={p.gameName}>
                                  {p.gameName}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Leaderboard (크루 티어 랭킹) */}
        <section style={styles.rightColumn}>
          <div style={styles.sectionHeader}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00ed64" strokeWidth="2" style={{ marginRight: '8px' }}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <h3 className="heading-3">티어 랭킹</h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th style={{ width: '60px', textAlign: 'center' }}>순위</th>
                  <th>소환사명</th>
                  <th>티어</th>
                  <th style={{ textAlign: 'center' }}>승률</th>
                  <th style={{ textAlign: 'right' }}>LP</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member, index) => {
                  const winRate = getWinRate(member.wins, member.losses);
                  const isTop3 = index < 3;
                  const rankBadgeStyle = isTop3 ? {
                    ...styles.rankBadge,
                    backgroundColor: index === 0 ? '#ffb703' : index === 1 ? '#adb5bd' : '#fa6e39',
                    color: '#001e2b'
                  } : styles.rankBadge;

                  return (
                    <tr 
                      key={member.id} 
                      onClick={async () => {
                        setSelectedPlayer(member);
                        setIsLoadingDetails(true);
                        await fetchMemberDetails(member);
                        setIsLoadingDetails(false);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <span style={rankBadgeStyle}>{index + 1}</span>
                      </td>
                      <td>
                        <div style={styles.tableUserCell}>
                          <RiotImage
                            kind="profileicon" asset={member.profileIconId}
                            alt={`${member.gameName} 프로필`}
                            style={styles.profileIconTiny} 
                          />
                          <div>
                            <span style={styles.tableUserName}>{member.gameName}</span>
                            <span style={styles.tableUserTag}>#{member.tagLine}</span>
                          </div>
                          {member.activeGame && <span className="pulse-indicator" style={{ marginLeft: '8px' }} />}
                        </div>
                      </td>
                      <td>
                        <span style={{ 
                          color: getTierColor(member.tier), 
                          fontWeight: 600,
                          fontSize: '13px'
                        }}>
                          {getTierLabelKR(member.tier)} {member.tier !== 'MASTER' && member.tier !== 'GRANDMASTER' && member.tier !== 'CHALLENGER' ? member.rank : ''}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={styles.winRateContainer}>
                          <span style={styles.winRateText}>{winRate}</span>
                          <span style={styles.winLossLabel}>{member.wins}승 {member.losses}패</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#ffffff' }}>
                        {member.leaguePoints} LP
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Detailed Player Modal (소환사 전적 상세조회) */}
      {selectedPlayer && (
        <div style={styles.modalOverlay} onClick={() => setSelectedPlayer(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={styles.modalHeader}>
              <div style={styles.modalUserBox}>
                <RiotImage
                  kind="profileicon" asset={selectedPlayer.profileIconId}
                  alt={`${selectedPlayer.gameName} 프로필`}
                  style={styles.modalProfileIcon} 
                />
                <div>
                  <h3 className="heading-2" style={{ color: '#ffffff' }}>
                    {selectedPlayer.gameName}
                    <span style={{ color: '#7c8c9a', fontSize: '18px', fontWeight: 400 }}>#{selectedPlayer.tagLine}</span>
                  </h3>
                  <div style={styles.modalUserSub}>
                    <span className="badge-green-soft">레벨 {selectedPlayer.summonerLevel}</span>
                    <span style={{ color: getTierColor(selectedPlayer.tier), fontWeight: 600, marginLeft: '12px' }}>
                      {getTierLabelKR(selectedPlayer.tier)} {selectedPlayer.tier !== 'MASTER' && selectedPlayer.tier !== 'GRANDMASTER' && selectedPlayer.tier !== 'CHALLENGER' ? selectedPlayer.rank : ''} - {selectedPlayer.leaguePoints} LP
                    </span>
                  </div>
                </div>
              </div>
              <button style={styles.modalCloseBtn} aria-label="상세 닫기" onClick={() => setSelectedPlayer(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div style={styles.modalBody}>
              <div style={styles.modalSectionTitle}>최근 경기 전적</div>

              {isLoadingDetails ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <span className="pulse-indicator" style={{ display: 'inline-block', width: '16px', height: '16px', marginBottom: '12px' }} />
                  <p className="body-sm" style={{ color: '#7c8c9a' }}>상세 전적을 불러오는 중...</p>
                </div>
              ) : selectedPlayer.matches && selectedPlayer.matches.length === 0 ? (
                <p className="body-sm" style={{ textAlign: 'center', padding: '24px' }}>매치 내역이 없습니다.</p>
              ) : selectedPlayer.matches && (
                <div style={styles.matchesList}>
                  {selectedPlayer.matches.map(match => {
                    const kda = getKdaRatio(match.kills, match.deaths, match.assists);
                    const cardStyle = match.win ? styles.winMatchCard : styles.lossMatchCard;
                    const statusText = match.win ? '승리' : '패배';
                    const statusColor = match.win ? '#00ed64' : '#ff4a4a';

                    return (
                      <div key={match.matchId} style={cardStyle}>
                        
                        {/* Game Status */}
                        <div style={styles.matchStatusColumn}>
                          <span style={{ ...styles.matchWinStatus, color: statusColor }}>{statusText}</span>
                          <span style={styles.matchModeLabel}>솔로랭크</span>
                          <span style={styles.matchTimeAgo}>{formatTimeAgo(match.gameCreation)}</span>
                          <span style={styles.matchDuration}>{formatDuration(match.gameDuration)}</span>
                        </div>

                        {/* Champ & KDA */}
                        <div style={styles.matchChampColumn}>
                          <div style={styles.matchChampPortraitWrapper}>
                            <RiotImage
                              kind="champion" asset={match.championName}
                              alt={match.championName} 
                              style={styles.matchChampPortrait}
                            />
                            <span style={styles.matchChampNameLabel}>{match.championName}</span>
                          </div>
                          <div style={styles.matchKdaWrapper}>
                            <div style={styles.kdaScores}>
                              <span style={styles.kdaKills}>{match.kills}</span>
                              <span style={styles.kdaDivider}>/</span>
                              <span style={styles.kdaDeaths}>{match.deaths}</span>
                              <span style={styles.kdaDivider}>/</span>
                              <span style={styles.kdaAssists}>{match.assists}</span>
                            </div>
                            <span style={styles.kdaRatioText}>KDA {kda}:1</span>
                          </div>
                        </div>

                        {/* CS and Gold */}
                        <div style={styles.matchStatsColumn}>
                          <span style={styles.matchStatRow}>CS <strong>{match.cs}</strong></span>
                          <span style={styles.matchStatRow}>골드 <strong>{match.gold.toLocaleString()}G</strong></span>
                        </div>

                        {/* Items Grid */}
                        <div style={styles.matchItemsColumn}>
                          {Array.from({ length: 6 }).map((_, itemIdx) => {
                            const itemId = match.items[itemIdx];
                            return (
                              <div key={itemIdx} style={styles.matchItemSlot}>
                                {itemId && itemId > 0 ? (
                                  <RiotImage
                                    kind="item" asset={itemId}
                                    alt={`아이템 ${itemId}`}
                                    style={styles.itemImage}
                                  />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
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
  },
  title: {
    color: '#ffffff',
    letterSpacing: '-1px',
  },
  subtitleText: {
    marginTop: '6px',
  },

  leftColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '4px',
  },
  emptyActiveCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    textAlign: 'center' as const,
    backgroundColor: '#0b2a38',
  },
  activeGamesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  activeGameCard: {
    backgroundColor: '#001e2b',
    border: '1px solid #1c4558',
    borderRadius: '12px',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  },
  activeGameMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
    borderBottom: '1px solid #143747',
    paddingBottom: '14px',
    marginBottom: '16px',
  },
  activeGameUser: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  profileIconMini: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid #00ed64',
  },
  activeGameName: {
    fontWeight: 600,
    color: '#ffffff',
    fontSize: '14.5px',
  },
  activeGameTag: {
    color: '#7c8c9a',
    fontSize: '12.5px',
  },
  activeGameTime: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #1c4558',
  },
  liveLabel: {
    color: '#00ed64',
    fontSize: '11px',
    fontWeight: 700,
    marginRight: '8px',
    letterSpacing: '0.5px',
  },
  timeValue: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  activeGameContent: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '18px',
  },
  champDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  champPortraitLarge: {
    width: '64px',
    height: '64px',
    borderRadius: '10px',
    border: '2px solid #1c4558',
  },
  champInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  champLabel: {
    fontSize: '11.5px',
    color: '#7c8c9a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  champName: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#00ed64',
    lineHeight: '1.2',
    margin: '2px 0',
  },
  gameModeLabel: {
    fontSize: '12px',
    color: '#a8b3bc',
  },
  teamsBox: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #143747',
  },
  teamColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  teamTitleAlly: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00ed64',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(0, 237, 100, 0.15)',
    paddingBottom: '4px',
  },
  teamTitleEnemy: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#ff4a4a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255, 74, 74, 0.15)',
    paddingBottom: '4px',
  },
  teamPlayersList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  activeTeamPlayer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  champTiny: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
  },
  teamPlayerName: {
    fontSize: '12px',
    color: '#a8b3bc',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '120px',
  },
  highlightedAllyName: {
    fontSize: '12px',
    color: '#00ed64',
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '120px',
  },
  rankBadge: {
    display: 'inline-flex',
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: '#1c4558',
    color: '#a8b3bc',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
  },
  tableUserCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  profileIconTiny: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    border: '1px solid #1c4558',
  },
  tableUserName: {
    fontWeight: 600,
    color: '#ffffff',
    fontSize: '13.5px',
  },
  tableUserTag: {
    color: '#5c6c7a',
    fontSize: '11.5px',
  },
  winRateContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  winRateText: {
    fontWeight: 600,
    color: '#ffffff',
    fontSize: '13.5px',
  },
  winLossLabel: {
    fontSize: '11px',
    color: '#7c8c9a',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 30, 43, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    backgroundColor: '#0b2a38',
    borderRadius: '16px',
    width: '640px',
    maxWidth: '90%',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
    border: '1px solid #1c4558',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #1c4558',
  },
  modalUserBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  modalProfileIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid #00ed64',
  },
  modalUserSub: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '4px',
    fontSize: '13px',
  },
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#7c8c9a',
    cursor: 'pointer',
  },
  modalBody: {
    padding: '24px',
    overflowY: 'auto' as const,
    flexGrow: 1,
  },
  modalSectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#00ed64',
    marginBottom: '16px',
  },
  matchesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  winMatchCard: {
    display: 'flex',
    backgroundColor: 'rgba(0, 237, 100, 0.04)',
    border: '1px solid rgba(0, 237, 100, 0.2)',
    borderLeft: '5px solid #00ed64',
    borderRadius: '8px',
    padding: '16px',
    gap: '24px',
    alignItems: 'center',
  },
  lossMatchCard: {
    display: 'flex',
    backgroundColor: 'rgba(255, 74, 74, 0.04)',
    border: '1px solid rgba(255, 74, 74, 0.2)',
    borderLeft: '5px solid #ff4a4a',
    borderRadius: '8px',
    padding: '16px',
    gap: '24px',
    alignItems: 'center',
  },
  matchStatusColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '80px',
  },
  matchWinStatus: {
    fontWeight: 700,
    fontSize: '15px',
  },
  matchModeLabel: {
    fontSize: '11px',
    color: '#a8b3bc',
    marginTop: '2px',
  },
  matchTimeAgo: {
    fontSize: '11px',
    color: '#7c8c9a',
    marginTop: '4px',
  },
  matchDuration: {
    fontSize: '11px',
    color: '#7c8c9a',
    fontFamily: 'monospace',
  },
  matchChampColumn: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '180px',
  },
  matchChampPortraitWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  matchChampPortrait: {
    width: '44px',
    height: '44px',
    borderRadius: '8px',
  },
  matchChampNameLabel: {
    fontSize: '10px',
    color: '#7c8c9a',
  },
  matchKdaWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  kdaScores: {
    display: 'flex',
    gap: '4px',
    fontWeight: 600,
    fontSize: '14.5px',
    color: '#ffffff',
  },
  kdaKills: {
    color: '#ffffff',
  },
  kdaDeaths: {
    color: '#ff4a4a',
  },
  kdaAssists: {
    color: '#7c8c9a',
  },
  kdaDivider: {
    color: '#4e5f6e',
    fontWeight: 400,
  },
  kdaRatioText: {
    fontSize: '11.5px',
    color: '#a8b3bc',
    marginTop: '2px',
  },
  matchStatsColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    width: '100px',
    fontSize: '12.5px',
    color: '#7c8c9a',
  },
  matchStatRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  matchItemsColumn: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px',
    marginLeft: 'auto',
  },
  matchItemSlot: {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    backgroundColor: '#001e2b',
    border: '1px solid #1c4558',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  }
};
