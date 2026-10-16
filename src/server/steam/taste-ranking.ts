import type { CatalogGame, GameTaste, TasteTag } from '../../domain/steam-personal';
import type { OwnedGame, RecentGame } from './client';

export interface MemberSignal { steamId: string; games: OwnedGame[]; recent: RecentGame[] | null; taste: GameTaste; observed?: RecentGame[] }
const overlap = (a: TasteTag[], b: TasteTag[]) => a.length && b.length ? a.filter(tag => b.includes(tag)).length / new Set([...a, ...b]).size : 0;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function affinity(game: Pick<CatalogGame, 'appId' | 'tags'>, member: MemberSignal, metadata: Map<number, TasteTag[]>) {
  const { taste } = member;
  const sources = member.games.filter(source => source.appId !== game.appId && source.minutes > 0 && metadata.get(source.appId)?.length);
  const recent = new Map((member.recent ?? []).map(game => [game.appId, game.minutes]));
  const observed = new Map((member.observed ?? []).map(game => [game.appId, game.minutes]));
  const similar = sources.map(source => ({ source, value: overlap(game.tags, metadata.get(source.appId) ?? []) *
    (0.5 + 0.3 * Math.min(1, Math.log1p(source.minutes) / Math.log1p(1200)) + (recent.get(source.appId) ? 0.2 : observed.get(source.appId) ? 0.15 : 0)) }))
    .sort((a, b) => b.value - a.value || a.source.appId - b.source.appId)[0];
  const likedTags = game.tags.filter(tag => taste.likes.includes(tag));
  const avoided = game.tags.some(tag => taste.avoids.includes(tag));
  const likedGame = taste.likedGames.includes(game.appId);
  const likedSimilarity = Math.max(0, ...taste.likedGames.filter(id => id !== game.appId).map(id => overlap(game.tags, metadata.get(id) ?? [])));
  const explicit = Math.max(likedGame ? 1 : 0, likedTags.length ? 0.6 + 0.4 * likedTags.length / Math.max(1, taste.likes.length) : 0, likedSimilarity * 0.8);
  const ownMinutes = member.games.find(source => source.appId === game.appId)?.minutes ?? 0;
  const ownActivity = 0.25 * Math.min(1, Math.log1p(ownMinutes) / Math.log1p(1200)) + (recent.get(game.appId) ? 0.2 : observed.get(game.appId) ? 0.15 : 0);
  const value = clamp(Math.max(explicit, (similar?.value ?? 0) * 0.45, ownActivity) - (avoided ? 0.6 : 0));
  return { value, hasSignal: !!(ownMinutes || recent.get(game.appId) || observed.get(game.appId) || likedGame ||
    (game.tags.length && (sources.length || taste.likes.length || taste.likedGames.length || taste.avoids.length))), similar,
    likedTags, avoided, likedGame };
}
