import { duoSynergy, type Member } from '@/features/lol';
import type { GamesSnapshot } from '@/features/steam';
import type { AiContext } from '@/server/ai/context';

// Project only necessary display facts. Account IDs and names never enter the
// analysis payload; the local legend is rendered separately by the app.
export function steamContext(snapshot: GamesSnapshot): AiContext | null {
  const { recommendations: rec, result, missionResult } = snapshot;
  if (!rec && !result) return null;
  const data = rec?.data ?? result!.data;
  const matchesQuery = (game: { name: string }) => game.name.toLocaleLowerCase().includes(snapshot.query.trim().toLocaleLowerCase());
  const basicGames = (result?.data.games ?? []).filter(matchesQuery).slice(0, 12).map(game => ({ name: game.name.slice(0, 160), totalMinutes: game.totalMinutes }));
  const recommendedGames = rec?.data.games.filter(matchesQuery).slice(0, 12).map(game => ({ name: game.name.slice(0, 160), totalMinutes: game.totalMinutes,
    owners: game.owners, score: game.score, support: game.support, minMinutes: game.minMinutes, maxMinutes: game.maxMinutes }));
  return {
    topic: 'steam', mode: rec ? 'recommendations' : result!.mode,
    scope: rec?.scope ?? 'all', preference: rec?.preference ?? 'balanced', people: (rec?.ids ?? result!.ids).length,
    excluded: data.excluded.length, unverified: rec?.data.unverified ?? 0, recentUnavailable: rec?.data.recentUnavailable?.length ?? 0,
    games: recommendedGames ?? basicGames,
    ...(rec && missionResult ? { missions: { game: missionResult.game.name.slice(0, 160), state: missionResult.data.state,
      unknownAchievements: missionResult.data.unknownAchievements, unavailable: missionResult.data.unavailableIds.length,
      goals: missionResult.data.missions.slice(0, 12).map(goal => ({ title: goal.title.slice(0, 160), kind: goal.kind, remaining: goal.lockedIds.length })) } } : {}),
  };
}

export function lolContext(members: Member[], view: 'overview' | 'synergy' | 'mastery'): AiContext {
  const visible = members.slice(0, 40);
  const identity = (player: { gameName: string; tagLine: string }) => JSON.stringify([player.gameName, player.tagLine]);
  const aliases = new Map(visible.map((member, i) => [identity(member), `플레이어 ${i + 1}`]));
  const anonymized = visible.map(member => ({ ...member, gameName: aliases.get(identity(member))!, tagLine: 'AI',
    matches: member.matches.map(match => ({ ...match, allPlayers: match.allPlayers.map(player => ({ ...player,
      gameName: aliases.get(identity(player)) ?? '외부 플레이어', tagLine: 'AI' })) })) }));
  return { topic: 'lol', view,
    players: visible.map((member, i) => ({ player: i + 1, tier: (member.tier || 'UNRANKED') as Extract<AiContext, { topic: 'lol' }>['players'][number]['tier'],
      wins: member.wins, losses: member.losses, detailsLoaded: member.championMasteries !== undefined,
      detailsUnavailable: Boolean(member.detailsError || member.matchesUnavailable),
      matches: member.matches.slice(0, 10).map(match => ({ champion: match.championName, win: match.win, kills: match.kills,
        deaths: match.deaths, assists: match.assists, cs: match.cs, seconds: match.gameDuration, mode: match.gameMode })),
      masteries: (member.championMasteries ?? []).slice(0, 5).map(mastery => ({ champion: mastery.championName, points: mastery.championPoints, level: mastery.championLevel })),
    })),
    duos: duoSynergy(anonymized).slice(0, 40).map(duo => ({ pair: duo.duoName.replaceAll('#AI', ''), games: duo.gamesPlayed, wins: duo.wins })),
  };
}
