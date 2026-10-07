import type React from 'react';
import type { Member } from '../types';
import { RiotImage } from './RiotImage';
import { RankLabel } from './RankLabel';
import { getTierOrder, getRankOrder } from '../mockData';
export function TierLeaderboard({ members, onSelectMember }: {
  members: Member[];
  onSelectMember: (member: Member) => void;
}) {
  const sortedMembers = [...members].sort((a, b) => {
    const tierDiff = getTierOrder(b.tier) - getTierOrder(a.tier);
    if (tierDiff !== 0)
      return tierDiff;
    const rankDiff = getRankOrder(b.rank) - getRankOrder(a.rank);
    if (rankDiff !== 0)
      return rankDiff;
    return b.leaguePoints - a.leaguePoints;
  });
  const getWinRate = (wins: number, losses: number) => {
    const total = wins + losses;
    if (total === 0)
      return '0%';
    return `${Math.round((wins / total) * 100)}%`;
  };
  return (<section style={styles.rightColumn}>
    <div style={styles.sectionHeader}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00ed64" strokeWidth="2" style={{ marginRight: '8px' }}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <h3 className="heading-3">티어 랭킹</h3>
    </div>

    <div style={{ overflowX: 'auto', minWidth: 0 }} role="region" aria-label="티어 랭킹 표" tabIndex={0}>
      <table className="comparison-table tier-ranking-table">
        <colgroup>
          <col style={{ width: '44px' }} />
          <col />
          <col style={{ width: '96px' }} />
          <col style={{ width: '76px' }} />
          <col style={{ width: '80px' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>순위</th>
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
            return (<tr key={member.id} onClick={() => onSelectMember(member)} style={{ cursor: 'pointer' }}>
              <td style={{ textAlign: 'center' }}>
                <span style={rankBadgeStyle}>{index + 1}</span>
              </td>
              <td>
                <div style={styles.tableUserCell}>
                  <RiotImage kind="profileicon" asset={member.profileIconId} alt={`${member.gameName} 프로필`} style={styles.profileIconTiny} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button className="btn btn-ghost" style={styles.tableUserName} aria-label={`${member.gameName}#${member.tagLine} 상세 보기`} onClick={e => { e.stopPropagation(); void onSelectMember(member); }}>{member.gameName}</button>
                    <span style={styles.tableUserTag}>#{member.tagLine}</span>
                  </div>
                  {member.activeGame && <span className="pulse-indicator" style={{ marginLeft: '8px' }} />}
                </div>
              </td>
              <td>
                <RankLabel tier={member.tier} rank={member.rank} style={{ fontWeight: 600, fontSize: '13px' }} />
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
            </tr>);
          })}
        </tbody>
      </table>
    </div>
  </section>);
}
const styles = {
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
    flexShrink: 0,
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    border: '1px solid #1c4558',
  },
  tableUserName: {
    width: '100%',
    minWidth: 0,
    padding: 0,
    textAlign: 'left',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    lineHeight: 1.5,
    fontWeight: 600,
    color: 'var(--ink)',
    fontSize: '13.5px',
  },
  tableUserTag: {
    display: 'block',
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
  }
} satisfies Record<string, React.CSSProperties>;
