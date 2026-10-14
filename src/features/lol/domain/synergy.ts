import type { Member, SynergyStats } from '../types';

const identity = (player: { gameName: string; tagLine: string }) => JSON.stringify([player.gameName, player.tagLine]);

// Full Riot IDs identify players. Match IDs and names are opaque strings, never
// delimiter-separated keys: a real match ID already contains an underscore.
export function duoSynergy(members: Member[]): SynergyStats[] {
  const roster = new Map(members.map(member => [identity(member), member]));
  const seen = new Set<string>();
  const pairs = new Map<string, { duoName: string; wins: number; losses: number; kills: number; deaths: number; assists: number }>();
  for (const member of members) {
    for (const match of member.matches) {
      const own = match.allPlayers.find(player => identity(player) === identity(member));
      if (!own) continue;
      for (const other of match.allPlayers) {
        if (identity(other) === identity(own) || !roster.has(identity(other)) || other.win !== own.win) continue;
        const identities = [identity(own), identity(other)].sort();
        const occurrence = JSON.stringify([match.matchId, ...identities]);
        if (seen.has(occurrence)) continue;
        seen.add(occurrence);
        const key = JSON.stringify(identities);
        const stats = pairs.get(key) ?? {
          duoName: identities.map(id => { const player = roster.get(id)!; return `${player.gameName}#${player.tagLine}`; }).join(' & '),
          wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0,
        };
        stats.wins += own.win ? 1 : 0;
        stats.losses += own.win ? 0 : 1;
        stats.kills += own.kills + other.kills;
        stats.deaths += own.deaths + other.deaths;
        stats.assists += own.assists + other.assists;
        pairs.set(key, stats);
      }
    }
  }
  return [...pairs.values()].map(stats => ({
    duoName: stats.duoName, gamesPlayed: stats.wins + stats.losses, wins: stats.wins, losses: stats.losses,
    winRate: Math.round(stats.wins / (stats.wins + stats.losses) * 100),
    avgKda: stats.deaths === 0 ? 'Perfect' : ((stats.kills + stats.assists) / stats.deaths).toFixed(2),
  })).sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.duoName.localeCompare(b.duoName));
}
