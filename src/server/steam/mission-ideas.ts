import type { AchievementDefinition } from './client';

export interface Mission {
  id: string;
  title: string;
  description: string | null;
  kind: 'team-first' | 'catch-up';
  unlockedIds: string[];
  lockedIds: string[];
}
export function buildMissionIdeas(definitions: AchievementDefinition[], players: { steamId: string; achievements: { id: string; unlocked: boolean }[] }[]) {
  const publicDefinitions = [...new Map(definitions.filter(definition => !definition.hidden).map(definition => [definition.id, definition])).values()];
  const progress = players.map(player => ({ steamId: player.steamId, flags: new Map(player.achievements.map(achievement => [achievement.id, achievement.unlocked])) }));
  const missions: Mission[] = [];
  let completedTogether = 0;
  let unknownAchievements = 0;
  for (const definition of publicDefinitions) {
    if (players.length < 2 || progress.some(player => !player.flags.has(definition.id))) { unknownAchievements++; continue; }
    const unlockedIds = progress.filter(player => player.flags.get(definition.id) === true).map(player => player.steamId);
    const lockedIds = progress.filter(player => player.flags.get(definition.id) === false).map(player => player.steamId);
    if (!lockedIds.length) { completedTogether++; continue; }
    missions.push({ id: definition.id, title: definition.title, description: definition.description,
      kind: unlockedIds.length ? 'catch-up' : 'team-first', unlockedIds, lockedIds });
  }
  // 경험자가 있는 목표를 먼저 제안한다. 난이도나 협동 달성 가능 여부는 추정하지 않는다.
  missions.sort((a, b) => b.unlockedIds.length - a.unlockedIds.length);
  return { missions: missions.slice(0, 12), totalPublic: publicDefinitions.length, completedTogether, unknownAchievements };
}
