import type React from 'react';
import type { MatchHistory } from '../types';
import { RiotImage } from './RiotImage';
import { formatDuration, formatTimeAgo, getKdaRatio } from './matchFormatting';
export function MatchHistoryCard({ match, now }: {
  match: MatchHistory;
  now: number;
}) {
  const kda = getKdaRatio(match.kills, match.deaths, match.assists);
  const cardStyle = match.win ? styles.winMatchCard : styles.lossMatchCard;
  const statusText = match.win ? '승리' : '패배';
  const statusColor = match.win ? 'var(--primary)' : '#ff4a4a';
  return (<div className="player-match-card" style={cardStyle}>

    {/* Game Status */}
    <div style={styles.matchStatusColumn}>
      <span style={{ ...styles.matchWinStatus, color: statusColor }}>{statusText}</span>
      <span style={styles.matchModeLabel}>솔로랭크</span>
      <span style={styles.matchTimeAgo}>{formatTimeAgo(match.gameCreation, now)}</span>
      <span style={styles.matchDuration}>{formatDuration(match.gameDuration)}</span>
    </div>

    {/* Champ & KDA */}
    <div style={styles.matchChampColumn}>
      <div style={styles.matchChampPortraitWrapper}>
        <RiotImage kind="champion" asset={match.championName} alt={match.championName} style={styles.matchChampPortrait} />
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
        return (<div key={itemIdx} style={styles.matchItemSlot}>
          {itemId && itemId > 0 ? (<RiotImage kind="item" asset={itemId} alt={`아이템 ${itemId}`} style={styles.itemImage} />) : null}
        </div>);
      })}
    </div>
  </div>);
}
const styles = {
  winMatchCard: {
    display: 'flex',
    backgroundColor: 'color-mix(in srgb, var(--primary) 4%, transparent)',
    border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
    borderLeft: '5px solid var(--primary)',
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
    color: 'var(--slate)',
    marginTop: '2px',
  },
  matchTimeAgo: {
    fontSize: '11px',
    color: 'var(--steel)',
    marginTop: '4px',
  },
  matchDuration: {
    fontSize: '11px',
    color: 'var(--steel)',
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
    color: 'var(--steel)',
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
    color: 'var(--ink)',
  },
  kdaKills: {
    color: 'var(--ink)',
  },
  kdaDivider: {
    color: 'var(--steel)',
    fontWeight: 400,
  },
  kdaDeaths: {
    color: '#ff4a4a',
  },
  kdaAssists: {
    color: 'var(--steel)',
  },
  kdaRatioText: {
    fontSize: '11.5px',
    color: 'var(--slate)',
    marginTop: '2px',
  },
  matchStatsColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    width: '100px',
    fontSize: '12.5px',
    color: 'var(--steel)',
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
    backgroundColor: 'var(--canvas-dark)',
    border: '1px solid var(--hairline)',
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
} satisfies Record<string, React.CSSProperties>;
