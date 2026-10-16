// Browser API contract, like api.ts. Features do not import server/domain modules.
export interface GameTaste { likes: string[]; avoids: string[]; likedGames: number[]; avoidedGames: number[] }
export const emptyTaste = (): GameTaste => ({ likes: [], avoids: [], likedGames: [], avoidedGames: [] });
export interface GameMode { label: string; min: number; max: number; online: boolean }
export interface CatalogGame { appId: number; name: string; tags: string[]; modes: GameMode[]; source: string; checkedAt: string; note?: string }
export interface TasteSettings { taste: GameTaste; members: { steamId: string; name: string; own: boolean }[]; catalog: CatalogGame[]; tags: { id: string; label: string }[] }
export interface PersonalResult { games: (CatalogGame & { score: number | null; reasons: string[]; owners: number; totalMinutes: number; missingIds: string[] })[];
  excluded: string[]; recentUnavailable: string[]; people: number; sharedPreferences: number; catalogSize: number; sourceGames: number; metadataUnavailable: number;
  capturedAt: string }
