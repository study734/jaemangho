// Browser API contract, like api.ts. Features do not import server/domain modules.
export interface GameTaste { likes: string[]; avoids: string[]; likedGames: number[]; avoidedGames: number[] }
export const emptyTaste = (): GameTaste => ({ likes: [], avoids: [], likedGames: [], avoidedGames: [] });
export interface GameMode { label: string; min: number; max: number; online: boolean }
export interface CatalogGame { appId: number; name: string; tags: string[]; modes: GameMode[]; source: string; checkedAt: string; note?: string }
export interface TasteSettings { taste: GameTaste; members: { steamId: string; name: string; own: boolean }[]; catalog: CatalogGame[]; tags: { id: string; label: string }[] }
