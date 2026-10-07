import type React from 'react';
import type { Member } from '../types';
import { useState } from 'react';
import { SummonerStatsFields, type SummonerStats } from './SummonerStatsFields';
export function EditSummonerForm({ member, onSave, onCancel }: {
  member: Member;
  onSave: (member: Member) => void;
  onCancel: () => void;
}) {
  const [stats, setStats] = useState<SummonerStats>(() => ({ summonerLevel: member.summonerLevel, leaguePoints: member.leaguePoints, tier: member.tier, rank: member.rank, wins: member.wins, losses: member.losses }));
  return <form style={styles.editSection} onSubmit={event => { event.preventDefault(); onSave({ ...member, ...stats }); }}>
    <SummonerStatsFields value={stats} onChange={setStats} />
    <div style={styles.editActionRow}><button className="btn btn-secondary" style={styles.editBtnCancel} type="button" onClick={onCancel}>
      취소
    </button>
      <button className="btn btn-primary" style={styles.editBtnSave} type="submit">
        저장
      </button></div>
  </form>;
}
const styles = {
  editSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
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
  }
} satisfies Record<string, React.CSSProperties>;
