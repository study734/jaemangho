// Shared display contracts; no provider, database or UI dependencies.
export const tasteTags = ['action', 'adventure', 'strategy', 'rpg', 'simulation', 'casual', 'puzzle', 'platformer', 'shooter', 'survival', 'crafting', 'cooking', 'roguelike', 'party', 'social', 'coop'] as const;
export type TasteTag = typeof tasteTags[number];
export const tasteLabels: Record<TasteTag, string> = { action: '액션', adventure: '어드벤처', strategy: '전략', rpg: 'RPG', simulation: '시뮬레이션', casual: '캐주얼', puzzle: '퍼즐', platformer: '플랫포머', shooter: '슈팅', survival: '생존', crafting: '제작·건설', cooking: '요리', roguelike: '로그라이크', party: '파티', social: '소셜 추리', coop: '협동' };
export interface GameTaste { likes: TasteTag[]; avoids: TasteTag[]; likedGames: number[]; avoidedGames: number[] }
export const emptyTaste = (): GameTaste => ({ likes: [], avoids: [], likedGames: [], avoidedGames: [] });
export interface GameMode { label: string; min: number; max: number; online: boolean }
export interface CatalogGame { appId: number; name: string; tags: TasteTag[]; modes: GameMode[]; source: string; checkedAt: string; note?: string }
export interface TasteRecommendation extends CatalogGame { score: number | null; reasons: string[]; owners: number; totalMinutes: number; missingIds: string[]; modes: GameMode[] }
export interface PersonalResult { games: TasteRecommendation[]; excluded: string[]; recentUnavailable: string[];
  people: number; sharedPreferences: number; catalogSize: number; sourceGames: number; metadataUnavailable: number;
  capturedAt: string }

// Only anonymous display facts cross into AI context; never profile notes, member
// IDs or the legend linking a recommendation to a particular person's taste.
export function recommendationFacts(result: Pick<PersonalResult, 'people' | 'excluded' | 'metadataUnavailable' | 'recentUnavailable'> &
  { games: Pick<TasteRecommendation, 'name' | 'totalMinutes' | 'owners' | 'score' | 'modes' | 'reasons' | 'checkedAt'>[] }) {
  return { topic: 'steam' as const, mode: 'recommendations' as const, scope: 'any' as const, preference: 'balanced' as const,
    kind: 'personal' as const, people: result.people, excluded: result.excluded.length, unverified: result.metadataUnavailable,
    recentUnavailable: result.recentUnavailable.length, games: result.games.map(game => ({ name: game.name,
      totalMinutes: game.totalMinutes, owners: game.owners, score: game.score, modes: game.modes,
      recommendationReasons: game.reasons, sourceCheckedAt: game.checkedAt,
    })) };
}
