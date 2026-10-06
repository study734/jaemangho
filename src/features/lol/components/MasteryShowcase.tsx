'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import type { Member, ChampionMastery } from '../types';
import { getTierColor } from '../mockData';

interface MasteryShowcaseProps {
  members: Member[];
}

export const MasteryShowcase: React.FC<MasteryShowcaseProps> = ({ members }) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');

  // Format points with commas
  const formatPoints = (pts: number) => {
    return pts.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Compile all masteries across the crew for a leaderboard
  const getAllMasteries = (): { member: Member; mastery: ChampionMastery }[] => {
    const list: { member: Member; mastery: ChampionMastery }[] = [];
    members.forEach(m => {
      if (m.championMasteries) {
        m.championMasteries.forEach(mastery => {
          list.push({ member: m, mastery });
        });
      }
    });
    // Sort by points descending
    return list.sort((a, b) => b.mastery.championPoints - a.mastery.championPoints);
  };

  const leaderboard = getAllMasteries();
  const topLeaderboard = leaderboard.slice(0, 6);

  // Filter members based on selection
  const filteredMembers = selectedMemberId === 'all' 
    ? members 
    : members.filter(m => m.id === selectedMemberId);

  // Format time ago
  const formatTimeAgo = (timestamp: number) => {
    // eslint-disable-next-line react-hooks/purity
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    const days = Math.floor(hrs / 24);
    return `${days}일 전`;
  };

  // Custom styling for Mastery Level Badges
  const getMasteryBadgeStyle = (level: number) => {
    switch (level) {
      case 7:
        return {
          backgroundColor: 'rgba(244, 140, 6, 0.15)',
          color: '#f48c06',
          border: '1.5px solid #f48c06',
          boxShadow: '0 0 10px rgba(244, 140, 6, 0.25)',
        };
      case 6:
        return {
          backgroundColor: 'rgba(199, 125, 255, 0.15)',
          color: '#c77dff',
          border: '1.5px solid #c77dff',
          boxShadow: '0 0 8px rgba(199, 125, 255, 0.2)',
        };
      case 5:
        return {
          backgroundColor: 'rgba(0, 180, 216, 0.15)',
          color: '#00b4d8',
          border: '1.5px solid #00b4d8',
        };
      default:
        return {
          backgroundColor: 'rgba(173, 181, 189, 0.15)',
          color: '#adb5bd',
          border: '1.5px solid #adb5bd',
        };
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>챔피언 숙련도</h2>
          <p className="subtitle">
            라이엇의 <code>CHAMPION-MASTERY-V4</code> API 데이터를 기반으로 등록된 소환사들의 주력 모스트 챔피언 및 통합 숙련도 랭킹을 파악합니다.
          </p>
        </div>
      </header>

      {/* Filter and Overview Grid */}
      <div style={styles.topSection}>
        {/* Left: Mastery Leaderboard (크루 통합 장인 리더보드) */}
        <section className="card-base" style={styles.leaderboardCard}>
          <h3 className="heading-3 mastery-leaderboard-title" style={{ color: '#00ed64', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏆</span> 통합 숙련도 리더보드
          </h3>
          
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>순위</th>
                  <th style={styles.th}>소환사명</th>
                  <th style={styles.th}>챔피언</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>숙련도 점수</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>레벨</th>
                </tr>
              </thead>
              <tbody>
                {topLeaderboard.map((item, idx) => (
                  <tr key={idx} style={styles.tr}>
                    <td style={styles.tdRank}>
                      <span style={idx < 3 ? styles.topRankBadge(idx) : styles.rankBadge}>
                        {idx + 1}
                      </span>
                    </td>
                    <td style={styles.tdMember}>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>{item.member.gameName}</span>
                      <span style={styles.tagLineMini}>#{item.member.tagLine}</span>
                    </td>
                    <td style={styles.tdChamp}>
                      <div style={styles.champCell}>
                        <img 
                          src={`https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/${item.mastery.championName}.png`}
                          alt={item.mastery.championName}
                          style={styles.champTinyIcon}
                        />
                        <span style={styles.champLabel}>{item.mastery.championName}</span>
                      </div>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: '#00ed64' }}>
                      {formatPoints(item.mastery.championPoints)} <span style={{ fontSize: '11px', color: '#7c8c9a', fontWeight: 400 }}>점</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{ ...styles.lvlBadgeMini, ...getMasteryBadgeStyle(item.mastery.championLevel) }}>
                        Lvl {item.mastery.championLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Selector Row */}
      <div style={styles.selectorRow}>
        <span style={styles.selectorLabel}>소환사 필터:</span>
        <div style={styles.selectorTabs}>
          <button 
            className={`btn ${selectedMemberId === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={styles.filterBtn}
            onClick={() => setSelectedMemberId('all')}
          >
            전체 보기
          </button>
          {members.map(m => (
            <button 
              key={m.id}
              className={`btn ${selectedMemberId === m.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                ...styles.filterBtn,
                borderColor: selectedMemberId === m.id ? '#00ed64' : '#1c4558'
              }}
              onClick={() => setSelectedMemberId(m.id)}
            >
              {m.gameName}
            </button>
          ))}
        </div>
      </div>

      {/* Grid: Crew Mastery Showdown Cards */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: '20px' }}>
        {filteredMembers.map(member => {
          const topChamps = member.championMasteries || [];
          return (
            <section key={member.id} className="card-feature-dark" style={styles.memberCard}>
              <div className="glow-bg" />
              
              {/* Card Header */}
              <div style={styles.memberHeader}>
                <div style={styles.memberHeaderLeft}>
                  <img 
                    src={`https://ddragon.leagueoflegends.com/cdn/13.24.1/img/profileicon/${member.profileIconId}.png`}
                    alt="profile" 
                    style={styles.profileMini} 
                  />
                  <div>
                    <h4 style={styles.memberName}>{member.gameName}</h4>
                    <span style={{ fontSize: '11px', color: '#7c8c9a' }}>#{member.tagLine}</span>
                  </div>
                </div>
                <div style={styles.memberHeaderRight}>
                  <span className="badge-green-soft" style={{ borderColor: getTierColor(member.tier), color: getTierColor(member.tier) }}>
                    {member.tier} {member.rank}
                  </span>
                  <span style={styles.lvlBadge}>Lv.{member.summonerLevel}</span>
                </div>
              </div>

              {/* Masteries Grid */}
              <div style={styles.masteriesList}>
                <div style={styles.listTitle}>주력 모스트 챔피언</div>
                
                {topChamps.length === 0 ? (
                  <div style={styles.emptyMastery}>
                    챔피언 숙련도 데이터가 없습니다. 실시간 API 연동이 필요할 수 있습니다.
                  </div>
                ) : (
                  topChamps.map((item, idx) => (
                    <div key={idx} style={styles.masteryItem}>
                      <div style={styles.masteryItemLeft}>
                        <div style={styles.champContainer}>
                          <img 
                            src={`https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/${item.championName}.png`}
                            alt={item.championName}
                            style={styles.champPortrait}
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Ezreal.png"; }}
                          />
                          <span style={styles.masteryNumberBadge}>{idx + 1}</span>
                        </div>
                        <div style={styles.masteryInfo}>
                          <h5 style={styles.champNameText}>{item.championName}</h5>
                          <span style={styles.lastPlayText}>최근 플레이: {formatTimeAgo(item.lastPlayTime)}</span>
                        </div>
                      </div>
                      <div style={styles.masteryItemRight}>
                        <span style={styles.masteryPoints}>{formatPoints(item.championPoints)} <span style={{ fontSize: '10px', color: '#7c8c9a', fontWeight: 400 }}>점</span></span>
                        <span style={{ ...styles.levelBadge, ...getMasteryBadgeStyle(item.championLevel) }}>
                          LEVEL {item.championLevel}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

const styles: { [key: string]: any } = {
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
    borderBottom: '1px solid #1c4558',
    paddingBottom: '20px',
  },
  title: {
    color: '#ffffff',
    letterSpacing: '-1px',
  },
  topSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  leaderboardCard: {
    backgroundColor: '#001e2b',
    border: '1px solid #1c4558',
    padding: '24px',
  },
  tableWrapper: {
    overflowX: 'auto' as const,
    minWidth: 0,
    maxWidth: '100%',
  },
  table: {
    width: '100%',
    minWidth: '520px',
    borderCollapse: 'collapse' as const,
    textAlign: 'left' as const,
  },
  th: {
    whiteSpace: 'nowrap',
    color: '#7c8c9a',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    padding: '12px 16px',
    borderBottom: '2px solid #1c4558',
  },
  tr: {
    borderBottom: '1px solid rgba(28, 69, 88, 0.4)',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: 'rgba(28, 69, 88, 0.2)',
    }
  },
  td: {
    padding: '14px 16px',
    fontSize: '13.5px',
    color: '#a8b3bc',
    verticalAlign: 'middle',
  },
  tdRank: {
    padding: '14px 16px',
    width: '60px',
    verticalAlign: 'middle',
  },
  tdMember: {
    padding: '14px 16px',
    verticalAlign: 'middle',
    fontSize: '14px',
  },
  tdChamp: {
    padding: '14px 16px',
    verticalAlign: 'middle',
  },
  tagLineMini: {
    fontSize: '10px',
    color: '#7c8c9a',
    marginLeft: '4px',
  },
  rankBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    backgroundColor: 'rgba(28, 69, 88, 0.5)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 700,
  },
  topRankBadge: (rankIdx: number) => {
    const bgColors = ['rgba(255, 183, 3, 0.2)', 'rgba(224, 224, 224, 0.2)', 'rgba(205, 127, 50, 0.2)'];
    const textColors = ['#ffb703', '#ffffff', '#cd7f32'];
    const borders = ['1px solid #ffb703', '1px solid #ffffff', '1px solid #cd7f32'];
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      borderRadius: '6px',
      backgroundColor: bgColors[rankIdx],
      color: textColors[rankIdx],
      border: borders[rankIdx],
      fontSize: '12px',
      fontWeight: 700,
    };
  },
  champCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  champTinyIcon: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid #1c4558',
  },
  champLabel: {
    color: '#ffffff',
    fontWeight: 500,
  },
  lvlBadgeMini: {
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
  },
  selectorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    borderTop: '1px solid #1c4558',
    paddingTop: '20px',
    flexWrap: 'wrap' as const,
  },
  selectorLabel: {
    color: '#7c8c9a',
    fontSize: '13px',
    fontWeight: 600,
  },
  selectorTabs: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  filterBtn: {
    padding: '6px 14px',
    fontSize: '12.5px',
    borderRadius: '6px',
  },
  memberCard: {
    backgroundColor: '#001e2b',
    border: '1px solid #1c4558',
    padding: '24px',
    borderRadius: '12px',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  memberHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1c4558',
    paddingBottom: '16px',
  },
  memberHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  profileMini: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid #1c4558',
  },
  memberName: {
    color: '#ffffff',
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
  },
  memberHeaderRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '6px',
  },
  lvlBadge: {
    fontSize: '11px',
    color: '#00ed64',
    fontWeight: 600,
  },
  masteriesList: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  listTitle: {
    fontSize: '11.5px',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#7c8c9a',
    letterSpacing: '0.8px',
    marginBottom: '4px',
  },
  emptyMastery: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#7c8c9a',
    fontSize: '12.5px',
    border: '1px dashed #1c4558',
    borderRadius: '8px',
  },
  masteryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 55, 71, 0.4)',
    border: '1px solid rgba(28, 69, 88, 0.5)',
    borderRadius: '8px',
    padding: '12px 14px',
  },
  masteryItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  champContainer: {
    position: 'relative' as const,
    width: '40px',
    height: '40px',
  },
  champPortrait: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: '1px solid #1c4558',
  },
  masteryNumberBadge: {
    position: 'absolute' as const,
    bottom: '-4px',
    right: '-4px',
    backgroundColor: '#001e2b',
    color: '#00ed64',
    fontSize: '9px',
    fontWeight: 800,
    width: '15px',
    height: '15px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #00ed64',
  },
  masteryInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
  },
  champNameText: {
    color: '#ffffff',
    fontSize: '14px',
    margin: 0,
    fontWeight: 600,
  },
  lastPlayText: {
    fontSize: '10.5px',
    color: '#7c8c9a',
    marginTop: '2px',
  },
  masteryItemRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '4px',
  },
  masteryPoints: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#ffffff',
  },
  levelBadge: {
    fontSize: '9px',
    fontWeight: 800,
    padding: '2px 6px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
  }
};
