'use client';
import type React from 'react';
import type { Member } from '../types';
import { useState } from 'react';
import { ActiveGamesPanel } from './ActiveGamesPanel';
import { TierLeaderboard } from './TierLeaderboard';
import { PlayerDetailsDialog } from './PlayerDetailsDialog';
interface DashboardProps {
  members: Member[];
  fetchMemberDetails: (member: Member) => Promise<void>;
}
export function Dashboard({ members, fetchMemberDetails }: DashboardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlayer = members.find(member => member.id === selectedId) ?? null;
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const isLoadingDetails = loadingId === selectedId;
  const [now] = useState(() => Date.now());
  const openDetails = async (member: Member) => {
    setSelectedId(member.id);
    setLoadingId(member.id);
    try {
      await fetchMemberDetails(member);
    }
    finally {
      setLoadingId(current => current === member.id ? null : current);
    }
  };
  return <div style={styles.container}>
    <header style={styles.header}>
      <div>
        <h2 className="heading-1" style={styles.title}>대시보드</h2>
        <p className="subtitle" style={styles.subtitleText}>등록된 소환사들의 실시간 상태와 랭킹을 확인하세요.</p>
      </div>
    </header>
    <div className="dashboard-grid dashboard-overview-grid"><ActiveGamesPanel members={members} /><TierLeaderboard members={members} onSelectMember={member => { void openDetails(member); }} /></div>
    {selectedPlayer && <PlayerDetailsDialog member={selectedPlayer} loading={isLoadingDetails} now={now} onClose={() => setSelectedId(null)} />}
  </div>;
}
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
    borderBottom: '1px solid var(--hairline)',
    paddingBottom: '20px',
  },
  title: {
    color: 'var(--ink)',
    letterSpacing: '-1px',
  },
  subtitleText: {
    marginTop: '6px',
  }
} satisfies Record<string, React.CSSProperties>;
