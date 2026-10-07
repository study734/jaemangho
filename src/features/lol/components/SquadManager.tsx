'use client';
import type React from 'react';
import type { Member } from '../types';
import { useState } from 'react';
import { AddSummonerForm } from './AddSummonerForm';
import { EditSummonerForm } from './EditSummonerForm';
import { RosterMemberCard } from './RosterMemberCard';
interface SquadManagerProps {
  members: Member[];
  onAddMember: (newMember: Omit<Member, 'id' | 'matches' | 'activeGame'>) => void;
  onRemoveMember: (id: string) => void;
  onUpdateMember: (member: Member) => void;
  onSearchMember: (gameName: string, tagLine: string) => Promise<Omit<Member, 'id' | 'matches' | 'activeGame'>>;
}
export function SquadManager({ members, onAddMember, onRemoveMember, onUpdateMember, onSearchMember }: SquadManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  return <div style={styles.container}>
    <header style={styles.header} className="squad-heading">
      <div>
        <h2 className="heading-1" style={styles.title}>소환사 관리</h2>
        <p className="subtitle">
          보고 싶은 소환사를 검색해 목록에 추가하면 대시보드에서 전적과 실시간 상태를 확인할 수 있습니다. 목록은 로그인한 모두에게 함께 보입니다.
        </p>
      </div>
      <button className="btn btn-primary" onClick={() => {
        setIsAdding(!isAdding);
      }}>
        {isAdding ? '닫기' : '소환사 추가'}
      </button>
    </header>
    {isAdding && <AddSummonerForm onAddMember={onAddMember} onSearchMember={onSearchMember} onComplete={() => setIsAdding(false)} />}
    <div style={styles.cardsGrid}>{members.map(member => <RosterMemberCard key={member.id} member={member} onEdit={() => setEditingId(member.id)} onRemove={onRemoveMember}>
      {editingId === member.id ? <EditSummonerForm key={member.id} member={member} onCancel={() => setEditingId(null)} onSave={updated => { onUpdateMember(updated); setEditingId(null); }} /> : null}
    </RosterMemberCard>)}</div>
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
    borderBottom: '1px solid #1c4558',
    paddingBottom: '20px',
    gap: '16px',
  },
  title: {
    color: '#ffffff',
    letterSpacing: '-1px',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
    gap: '24px',
    alignItems: 'start',
  }
} satisfies Record<string, React.CSSProperties>;
