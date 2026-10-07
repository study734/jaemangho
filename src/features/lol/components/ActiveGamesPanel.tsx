import type React from 'react';
import type { Member } from '../types';
import { ActiveGameCard } from './ActiveGameCard';
export function ActiveGamesPanel({ members }: {
  members: Member[];
}) {
  const activeGames = members.filter(member => member.activeGame !== null);
  return (<section style={styles.leftColumn}>
    <div style={styles.sectionHeader}>
      <span className="pulse-indicator" style={{ marginRight: '8px' }} />
      <h3 className="heading-3">실시간 전투 현황</h3>
      <span className="badge-green-soft" style={{ marginLeft: '10px' }}>{activeGames.length}명 진행 중</span>
    </div>

    {activeGames.length === 0 ? (<div className="card-base" style={styles.emptyActiveCard}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.5">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M12 6v6l4 2" />
      </svg>
      <h4 className="heading-5" style={{ marginTop: '12px', color: 'var(--steel)' }}>현재 게임 중인 소환사가 없습니다.</h4>
      <p className="body-sm" style={{ marginTop: '4px' }}>등록된 소환사가 게임을 시작하면 실시간 현황판이 활성화됩니다.</p>
    </div>) : (<div style={styles.activeGamesList}>
      {activeGames.map(member => member.activeGame && <ActiveGameCard key={member.id} member={member} game={member.activeGame} />)}
    </div>)}
  </section>);
}
const styles = {
  leftColumn: {
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
    backgroundColor: 'var(--surface)',
  },
  activeGamesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  }
} satisfies Record<string, React.CSSProperties>;
