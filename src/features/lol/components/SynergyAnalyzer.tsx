import React from 'react';
import type { Member, SynergyStats } from '../types';

interface SynergyAnalyzerProps {
  members: Member[];
}

export const SynergyAnalyzer: React.FC<SynergyAnalyzerProps> = ({ members }) => {
  
  // Calculate duo stats across all matches
  const getDuoSynergy = (): SynergyStats[] => {
    const duoMap: { [key: string]: { wins: number; losses: number; kills: number; deaths: number; assists: number; count: number } } = {};

    // Helper to generate a sorted key representing a player pair
    const getPairKey = (n1: string, n2: string) => {
      return [n1, n2].sort().join(' & ');
    };

    // Iterate through all members and their matches
    members.forEach(member => {
      member.matches.forEach(match => {
        // Find other guild members who were in this SAME match on the SAME team
        const userInMatch = match.allPlayers.find(p => p.gameName === member.gameName && p.tagLine === member.tagLine);
        if (!userInMatch) return; // user wasn't in this match? (safety check)

        const userWin = match.win;

        // Scan other players in this match
        match.allPlayers.forEach(otherPlayer => {
          if (otherPlayer.gameName === member.gameName && otherPlayer.tagLine === member.tagLine) return; // skip self

          // Check if this other player is also a member of our squad
          const isSquadMember = members.some(m => m.gameName === otherPlayer.gameName && m.tagLine === otherPlayer.tagLine);
          if (!isSquadMember) return;

          // Double check they were on the SAME team (both win or both lose since they are allies)
          if (otherPlayer.win !== userWin) return; // they were on opposing teams

          // We found a duo match! To avoid double-counting (since both players' match histories might contain this match),
          // we associate it with a unique game matchId + sorted duo pair key
          const duoKey = getPairKey(member.gameName, otherPlayer.gameName);
          const uniqKey = `${match.matchId}_${duoKey}`;
          
          // Let's store temporary stats
          if (!duoMap[uniqKey]) {
            duoMap[uniqKey] = {
              wins: userWin ? 1 : 0,
              losses: userWin ? 0 : 1,
              kills: userInMatch.kills + otherPlayer.kills,
              deaths: userInMatch.deaths + otherPlayer.deaths,
              assists: userInMatch.assists + otherPlayer.assists,
              count: 1
            };
          }
        });
      });
    });

    // Consolidate unique game records into player pair aggregates
    const consolidatedMap: { [key: string]: { wins: number; losses: number; kills: number; deaths: number; assists: number; count: number } } = {};
    Object.entries(duoMap).forEach(([uniqKey, stats]) => {
      // uniqKey is: matchId_player1 & player2
      const duoKey = uniqKey.split('_')[1];
      if (!consolidatedMap[duoKey]) {
        consolidatedMap[duoKey] = { wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, count: 0 };
      }
      consolidatedMap[duoKey].wins += stats.wins;
      consolidatedMap[duoKey].losses += stats.losses;
      consolidatedMap[duoKey].kills += stats.kills;
      consolidatedMap[duoKey].deaths += stats.deaths;
      consolidatedMap[duoKey].assists += stats.assists;
      consolidatedMap[duoKey].count += 1;
    });

    // Map to final array
    const results: SynergyStats[] = Object.entries(consolidatedMap).map(([pairName, stats]) => {
      const avgKda = stats.deaths === 0 ? 'Perfect' : ((stats.kills + stats.assists) / stats.deaths).toFixed(2);
      return {
        duoName: pairName,
        gamesPlayed: stats.count,
        wins: stats.wins,
        losses: stats.losses,
        winRate: Math.round((stats.wins / stats.count) * 100),
        avgKda
      };
    });

    // Sort by games played desc
    return results.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  };

  const duos = getDuoSynergy();

  // Find Best Synergy (Win Rate >= 55% & Played >= 2 games, or sorted by Win Rate desc)
  const bestSynergies = [...duos]
    .filter(d => d.winRate >= 50)
    .sort((a, b) => b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed);

  // Find Worst Synergy (Win Rate < 50% & Played >= 1 game, sorted by Win Rate asc)
  const worstSynergies = [...duos]
    .filter(d => d.winRate < 50)
    .sort((a, b) => a.winRate - b.winRate || b.gamesPlayed - a.gamesPlayed);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>듀오 시너지 분석기</h2>
          <p className="subtitle">누가 같이 게임할 때 승률이 떡상하고 떡락할까요? 최근 전적 데이터를 모아 환상/환장의 커플을 분석합니다.</p>
        </div>
      </header>

      {duos.length === 0 ? (
        <div className="card-base" style={styles.emptyCard}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4e5f6e" strokeWidth="1.5">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          <h4 className="heading-5" style={{ marginTop: '12.5px', color: '#7c8c9a' }}>시너지를 분석할 데이터가 부족합니다.</h4>
          <p className="body-sm" style={{ marginTop: '4px' }}>등록된 소환사끼리 아군으로 매칭되어 플레이한 기록이 존재해야 승률 연산이 이루어집니다.</p>
        </div>
      ) : (
        <div style={styles.content}>
          {/* Highlight Cards: Best vs Worst */}
          <div className="synergy-highlight-row">
            
            {/* Best Duo Card */}
            <div className="pricing-card-featured" style={styles.highlightCard}>
              <div style={styles.badgeRow}>
                <span className="badge-green">BEST</span>
                <span style={styles.cardEyebrow}>환상의 시너지</span>
              </div>
              
              {bestSynergies.length > 0 ? (
                <div style={styles.duoHighlightBox}>
                  <h4 style={styles.duoNameText}>{bestSynergies[0].duoName}</h4>
                  <div style={styles.largeWinRateText}>{bestSynergies[0].winRate}%</div>
                  <div style={styles.duoDetailsText}>
                    전적: <strong>{bestSynergies[0].gamesPlayed}판 {bestSynergies[0].wins}승 {bestSynergies[0].losses}패</strong>
                  </div>
                  <div style={styles.duoDetailsText}>
                    평균 KDA: <strong style={{ color: '#00ed64' }}>{bestSynergies[0].avgKda}:1</strong>
                  </div>
                  <p className="body-sm" style={styles.cardComment}>
                    이 둘은 찰떡궁합입니다. 같이 큐를 돌리면 캐리력이 폭발하는 환상의 듀오!
                  </p>
                </div>
              ) : (
                <p className="body-sm" style={styles.noDuoLabel}>기준에 부합하는 베스트 듀오가 없습니다.</p>
              )}
            </div>

            {/* Worst Duo Card */}
            <div className="card-base" style={{ ...styles.highlightCard, border: '2px solid #ff4a4a' }}>
              <div style={styles.badgeRow}>
                <span className="badge-orange" style={{ backgroundColor: '#ff4a4a' }}>WORST</span>
                <span style={styles.cardEyebrow}>환장의 시너지</span>
              </div>

              {worstSynergies.length > 0 ? (
                <div style={styles.duoHighlightBox}>
                  <h4 style={styles.duoNameText}>{worstSynergies[0].duoName}</h4>
                  <div style={{ ...styles.largeWinRateText, color: '#ff4a4a' }}>{worstSynergies[0].winRate}%</div>
                  <div style={styles.duoDetailsText}>
                    전적: <strong>{worstSynergies[0].gamesPlayed}판 {worstSynergies[0].wins}승 {worstSynergies[0].losses}패</strong>
                  </div>
                  <div style={styles.duoDetailsText}>
                    평균 KDA: <strong style={{ color: '#ff4a4a' }}>{worstSynergies[0].avgKda}:1</strong>
                  </div>
                  <p className="body-sm" style={styles.cardComment}>
                    이 조합은 봉인하시는 것이 좋겠습니다. 같이 큐를 돌리면 트롤러가 되는 파멸의 듀오!
                  </p>
                </div>
              ) : (
                <p className="body-sm" style={styles.noDuoLabel}>기준에 부합하는 워스트 듀오가 없습니다.</p>
              )}
            </div>
          </div>

          {/* Full List Table */}
          <div style={styles.tableSection}>
            <h3 className="heading-3" style={{ marginBottom: '16px' }}>전체 듀오 시너지 분석 피드</h3>
            
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>듀오 페어 (Duo Combination)</th>
                  <th style={{ textAlign: 'center' }}>총 경기 수</th>
                  <th style={{ textAlign: 'center' }}>승 / 패</th>
                  <th style={{ textAlign: 'center' }}>합산 승률</th>
                  <th style={{ textAlign: 'right' }}>평균 KDA</th>
                </tr>
              </thead>
              <tbody>
                {duos.map((duo, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: '#ffffff' }}>
                      {duo.duoName}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {duo.gamesPlayed}판
                    </td>
                    <td style={{ textAlign: 'center', color: '#a8b3bc' }}>
                      {duo.wins}승 {duo.losses}패
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ 
                        color: duo.winRate >= 50 ? '#00ed64' : '#ff4a4a',
                        fontWeight: 700
                      }}>
                        {duo.winRate}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#ffb703' }}>
                      {duo.avgKda}:1
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    overflowY: 'auto' as const,
    height: '100vh',
  },
  header: {
    borderBottom: '1px solid #1c4558',
    paddingBottom: '20px',
  },
  title: {
    color: '#ffffff',
    letterSpacing: '-1px',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px',
    backgroundColor: '#0b2a38',
    textAlign: 'center' as const,
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
  },

  highlightCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    backgroundColor: '#001e2b',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  cardEyebrow: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#7c8c9a',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  duoHighlightBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
    padding: '12px 0',
  },
  duoNameText: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#ffffff',
  },
  largeWinRateText: {
    fontSize: '64px',
    fontWeight: 700,
    color: '#00ed64',
    margin: '10px 0',
    lineHeight: '1',
  },
  duoDetailsText: {
    fontSize: '14px',
    color: '#a8b3bc',
    marginBottom: '6px',
  },
  cardComment: {
    marginTop: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #143747',
    color: '#a8b3bc',
  },
  noDuoLabel: {
    textAlign: 'center' as const,
    padding: '24px',
    color: '#5c6c7a',
  },
  tableSection: {
    display: 'flex',
    flexDirection: 'column' as const,
  }
};
