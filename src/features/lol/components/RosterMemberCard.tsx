import type React from 'react';
import type { Member } from '../types';
import { RiotImage } from './RiotImage';
import { RankLabel } from './RankLabel';
export function RosterMemberCard({ member, onEdit, onRemove, children }: {
  member: Member;
  onEdit: () => void;
  onRemove: (id: string) => void;
  children?: React.ReactNode;
}) {
  return <div className="card-base" style={styles.memberCard}>
    <div style={styles.cardHeader}>
      <div style={styles.userBox}>
        <RiotImage kind="profileicon" asset={member.profileIconId} alt={`${member.gameName} 프로필`} style={styles.profileIcon} />
        <div>
          <h4 style={styles.userName}>{member.gameName}</h4>
          <span style={styles.userTag}>#{member.tagLine}</span>
        </div>
      </div>

      {!children && (<button style={styles.removeBtn} onClick={() => {
        if (confirm(`${member.gameName}을(를) 목록에서 삭제하시겠습니까?\n(게임 계정에는 영향이 없고, 이 대시보드 목록에서만 사라집니다)`)) {
          onRemove(member.id);
        }
      }} title="목록에서 삭제">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>)}
    </div>
    {children ?? (<div style={styles.statsSection}>
      <div style={styles.statBox}>
        <span style={styles.statLabel}>티어 스펙</span>
        <RankLabel tier={member.tier} rank={member.rank} style={styles.statValue} />
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
      <button className="btn btn-secondary" style={styles.editBtn} onClick={onEdit}>
        정보 편집
      </button>
    </div>)}
  </div>;
}
const styles = {
  memberCard: {
    backgroundColor: 'var(--canvas-dark)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--hairline)',
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
    border: '1.5px solid var(--primary)',
  },
  userName: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--ink)',
  },
  userTag: {
    fontSize: '12px',
    color: 'var(--steel)',
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
    backgroundColor: 'var(--surface)',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--hairline)',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--steel)',
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
    backgroundColor: 'var(--surface)',
    padding: '6px',
    borderRadius: '4px',
    border: '1px solid var(--hairline)',
  },
  statLabelMini: {
    fontSize: '10px',
    color: 'var(--steel)',
  },
  statValueMini: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: 'var(--ink)',
    marginTop: '2px',
  },
  editBtn: {
    width: '100%',
    padding: '8px',
    fontSize: '12.5px',
  }
} satisfies Record<string, React.CSSProperties>;
