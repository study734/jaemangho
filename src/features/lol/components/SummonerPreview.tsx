import type React from 'react';
import type { Member } from '../types';
import { RiotImage } from './RiotImage';
import { RankLabel } from './RankLabel';
export function SummonerPreview({ profile, onRetry, onConfirm }: {
  profile: Omit<Member, 'id' | 'matches' | 'activeGame'>;
  onRetry: () => void;
  onConfirm: () => void;
}) {
  return (<div className="card-feature" style={styles.previewCard}>
    <h4 style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.8px' }}>
      ✓ 계정 확인 완료
    </h4>

    <div style={styles.previewContainer}>
      <RiotImage kind="profileicon" asset={profile.profileIconId} alt={`${profile.gameName} 프로필`} style={styles.previewIcon} />
      <div style={styles.previewMainInfo}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <h3 style={styles.previewName}>{profile.gameName}</h3>
          <span style={styles.previewTag}>#{profile.tagLine}</span>
        </div>
        <div style={styles.previewLevelBadge}>
          Lv.{profile.summonerLevel}
        </div>
      </div>

      <div style={styles.previewStats}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '80px' }}>
          <span style={styles.previewLabel}>티어</span>
          <RankLabel tier={profile.tier} rank={profile.rank} style={styles.previewValue} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '60px' }}>
          <span style={styles.previewLabel}>LP</span>
          <span style={styles.previewValue}>{profile.leaguePoints} LP</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '100px' }}>
          <span style={styles.previewLabel}>전적</span>
          <span style={styles.previewValue}>
            {profile.wins}승 {profile.losses}패 ({Math.round((profile.wins / (profile.wins + profile.losses)) * 100) || 50}%)
          </span>
        </div>
      </div>
    </div>

    {profile.championMasteries && profile.championMasteries.length > 0 && (<div style={styles.previewMasteryRow}>
      <div style={styles.previewLabelMini}>주력 모스트 챔피언</div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
        {profile.championMasteries.map((m, idx) => (<div key={idx} style={styles.previewMasteryItem}>
          <RiotImage kind="champion" asset={m.championName} alt={m.championName} style={styles.previewMasteryIcon} />
          <div style={{ fontSize: '11.5px', color: 'var(--ink)', fontWeight: 600 }}>{m.championName}</div>
          <div style={{ fontSize: '10px', color: 'var(--steel)' }}>Lvl {m.championLevel}</div>
        </div>))}
      </div>
    </div>)}

    <div style={styles.previewActions}>
      <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '10px 20px', fontSize: '13px' }} onClick={onRetry}>
        다시 검색
      </button>
      <button type="button" className="btn btn-primary" style={{ flex: 2, padding: '10px 20px', fontWeight: 700, fontSize: '13px' }} onClick={onConfirm}>
        이 소환사 추가하기
      </button>
    </div>
  </div>);
}
const styles = {
  previewCard: {
    backgroundColor: 'var(--canvas-dark)',
    border: '1.5px solid var(--primary)',
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
    backgroundColor: 'var(--surface)',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid var(--hairline)',
  },
  previewIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    border: '2px solid var(--primary)',
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
    color: 'var(--ink)',
    margin: 0,
  },
  previewTag: {
    fontSize: '13px',
    color: 'var(--steel)',
  },
  previewLevelBadge: {
    fontSize: '11.5px',
    color: 'var(--primary)',
    fontWeight: 600,
    backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
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
    color: 'var(--steel)',
    textTransform: 'uppercase' as const,
  },
  previewValue: {
    fontSize: '13.5px',
    fontWeight: 700,
    color: 'var(--ink)',
    marginTop: '2px',
  },
  previewMasteryRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    borderTop: '1px solid var(--hairline)',
    paddingTop: '14px',
  },
  previewLabelMini: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: 'var(--steel)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  previewMasteryItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'var(--surface)',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--hairline)',
    minWidth: '85px',
  },
  previewMasteryIcon: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    border: '1px solid var(--hairline)',
  },
  previewActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    borderTop: '1px solid var(--hairline)',
    paddingTop: '16px',
  }
} satisfies Record<string, React.CSSProperties>;
