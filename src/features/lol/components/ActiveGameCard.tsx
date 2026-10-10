import type React from 'react';
import type { Member } from '../types';
import { RiotImage } from './RiotImage';
import { formatDuration } from './matchFormatting';
import type { ActiveGame } from '../types';
export function ActiveGameCard({ member, game }: {
  member: Pick<Member, 'gameName' | 'tagLine' | 'profileIconId'>;
  game: ActiveGame;
}) {
  return (<div className="card-feature-dark" style={styles.activeGameCard}>
    <div className="glow-bg" />

    {/* Game Meta */}
    <div style={styles.activeGameMeta}>
      <div style={styles.activeGameUser}>
        <RiotImage kind="profileicon" asset={member.profileIconId} alt={`${member.gameName} 프로필`} style={styles.profileIconMini} />
        <div>
          <span style={styles.activeGameName}>{member.gameName}</span>
          <span style={styles.activeGameTag}>#{member.tagLine}</span>
        </div>
      </div>
      <div style={styles.activeGameTime}>
        <span className="pulse-indicator" style={{ marginRight: '6px' }} />
        <span style={styles.liveLabel}>LIVE</span>
        <span style={styles.timeValue}>{formatDuration(game.gameLength)}</span>
      </div>
    </div>

    {/* Champion & Spec */}
    <div style={styles.activeGameContent}>
      <div style={styles.champDisplay}>
        <RiotImage kind="champion" asset={game.championName} alt={game.championName} style={styles.champPortraitLarge} />
        <div style={styles.champInfo}>
          <span style={styles.champLabel}>플레이 챔피언</span>
          <h4 style={styles.champName}>{game.championName}</h4>
          <span style={styles.gameModeLabel}>솔로 랭크전 - 소환사의 협곡</span>
        </div>
      </div>

      {/* Team Composition Summary */}
      <div style={styles.teamsBox}>
        <GameTeam side="ally" players={game.teamPlayers.filter(p => p.isAlly)} highlightName={member.gameName} />
        <GameTeam side="enemy" players={game.teamPlayers.filter(p => !p.isAlly)} />
      </div>
    </div>
  </div>);
}
function GameTeam({ side, players, highlightName }: {
  side: 'ally' | 'enemy';
  players: ActiveGame['teamPlayers'];
  highlightName?: string;
}) {
  return <div style={styles.teamColumn}>
    <div style={side === 'ally' ? styles.teamTitleAlly : styles.teamTitleEnemy}>{side === 'ally' ? '아군 팀' : '적군 팀'}</div>
    <div style={styles.teamPlayersList}>{players.map((player, index) => <div key={index} style={styles.activeTeamPlayer}>
      <RiotImage kind="champion" asset={player.championName} alt={player.championName} style={styles.champTiny} />
      <span style={player.gameName === highlightName ? styles.highlightedAllyName : styles.teamPlayerName} title={player.gameName}>{player.gameName}</span>
    </div>)}</div>
  </div>;
}
const styles = {
  activeGameCard: {
    backgroundColor: 'var(--canvas-dark)',
    border: '1px solid var(--hairline)',
    borderRadius: '8px',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  },
  activeGameMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
    borderBottom: '1px solid var(--hairline)',
    paddingBottom: '14px',
    marginBottom: '16px',
  },
  activeGameUser: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  profileIconMini: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid var(--primary)',
  },
  activeGameName: {
    fontWeight: 600,
    color: 'var(--ink)',
    fontSize: '14.5px',
  },
  activeGameTag: {
    color: 'var(--steel)',
    fontSize: '12.5px',
  },
  activeGameTime: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--surface)',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--hairline)',
  },
  liveLabel: {
    color: 'var(--primary)',
    fontSize: '11px',
    fontWeight: 700,
    marginRight: '8px',
    letterSpacing: '0.5px',
  },
  timeValue: {
    color: 'var(--ink)',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
  },
  activeGameContent: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '18px',
  },
  champDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  champPortraitLarge: {
    width: '64px',
    height: '64px',
    borderRadius: '10px',
    border: '2px solid var(--hairline)',
  },
  champInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  champLabel: {
    fontSize: '11.5px',
    color: 'var(--steel)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  champName: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--primary)',
    lineHeight: '1.2',
    margin: '2px 0',
  },
  gameModeLabel: {
    fontSize: '12px',
    color: 'var(--slate)',
  },
  teamsBox: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    backgroundColor: 'var(--surface)',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--hairline)',
  },
  teamColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  teamTitleAlly: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--primary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
    paddingBottom: '4px',
  },
  teamTitleEnemy: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#ff4a4a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255, 74, 74, 0.15)',
    paddingBottom: '4px',
  },
  teamPlayersList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  activeTeamPlayer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  champTiny: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
  },
  highlightedAllyName: {
    fontSize: '12px',
    color: 'var(--primary)',
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '120px',
  },
  teamPlayerName: {
    fontSize: '12px',
    color: 'var(--slate)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '120px',
  }
} satisfies Record<string, React.CSSProperties>;
