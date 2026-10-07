import type React from 'react';
import type { Member } from '../types';
import { useCallback, useId } from 'react';
import { RiotImage } from './RiotImage';
import { RankLabel } from './RankLabel';
import { MatchHistoryCard } from './MatchHistoryCard';
export function PlayerDetailsDialog({ member, loading, now, onClose }: {
  member: Member;
  loading: boolean;
  now: number;
  onClose: () => void;
}) {
  const titleId = useId();
  const showDialog = useCallback((node: HTMLDialogElement | null) => {
    if (node && !node.open)
      node.showModal();
  }, []);
  return (<dialog className="player-details-dialog" style={styles.modalContent} aria-labelledby={titleId} ref={showDialog} onClose={onClose} onClick={e => {
    const box = e.currentTarget.getBoundingClientRect();
    if (e.target === e.currentTarget && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom))
      e.currentTarget.close();
  }}>

    {/* Modal Header */}
    <div className="player-details-header" style={styles.modalHeader}>
      <div style={styles.modalUserBox}>
        <RiotImage kind="profileicon" asset={member.profileIconId} alt={`${member.gameName} 프로필`} style={styles.modalProfileIcon} />
        <div>
          <h3 id={titleId} className="heading-2" style={{ color: 'var(--ink)' }}>
            {member.gameName}
            <span style={{ color: 'var(--steel)', fontSize: '18px', fontWeight: 400 }}>#{member.tagLine}</span>
          </h3>
          <div style={styles.modalUserSub}>
            <span className="badge-green-soft">레벨 {member.summonerLevel}</span>
            <RankLabel tier={member.tier} rank={member.rank} style={{ fontWeight: 600, marginLeft: '12px' }}>
              {' - '}{member.leaguePoints} LP
            </RankLabel>
          </div>
        </div>
      </div>
      <button className="btn btn-ghost" style={styles.modalCloseBtn} aria-label="상세 닫기" onClick={e => e.currentTarget.closest('dialog')?.close()}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    {/* Modal Body */}
    <div style={styles.modalBody}>
      <div style={styles.modalSectionTitle}>최근 경기 전적</div>

      {loading ? (<div style={{ textAlign: 'center', padding: '40px' }}>
        <span className="pulse-indicator" style={{ display: 'inline-block', width: '16px', height: '16px', marginBottom: '12px' }} />
        <p className="body-sm" style={{ color: 'var(--steel)' }}>상세 전적을 불러오는 중...</p>
      </div>) : member.matches && member.matches.length === 0 ? (<p className="body-sm" style={{ textAlign: 'center', padding: '24px' }}>매치 내역이 없습니다.</p>) : member.matches && (<div style={styles.matchesList}>
        {member.matches.map(match => <MatchHistoryCard key={match.matchId} match={match} now={now} />)}
      </div>)}
    </div>
  </dialog>);
}
const styles = {
  modalContent: {
    margin: 'auto',
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    borderRadius: '12px',
    padding: 0,
    width: '640px',
    maxWidth: '90%',
    maxHeight: '85vh',
    flexDirection: 'column' as const,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
    border: '1px solid var(--hairline)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid var(--hairline)',
  },
  modalUserBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    minWidth: 0,
  },
  modalProfileIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid var(--primary)',
  },
  modalUserSub: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '4px',
    fontSize: '13px',
  },
  modalCloseBtn: {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: 'var(--steel)',
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
    color: 'var(--primary)',
    marginBottom: '16px',
  },
  matchesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  }
} satisfies Record<string, React.CSSProperties>;
