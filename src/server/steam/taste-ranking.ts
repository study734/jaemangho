import type { CatalogGame, GameTaste, PersonalResult, TasteRecommendation, TasteTag } from '../../domain/steam-personal';
import type { OwnedGame, RecentGame } from './client';

export interface MemberSignal { steamId: string; games: OwnedGame[]; recent: RecentGame[] | null; taste: GameTaste }
const overlap = (a: TasteTag[], b: TasteTag[]) => a.length && b.length ? a.filter(tag => b.includes(tag)).length / new Set([...a, ...b]).size : 0;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

function affinity(game: CatalogGame, member: MemberSignal, metadata: Map<number, TasteTag[]>) {
  const { taste } = member;
  const sources = member.games.filter(source => source.appId !== game.appId && source.minutes > 0 && metadata.has(source.appId));
  const recent = new Map((member.recent ?? []).map(game => [game.appId, game.minutes]));
  const similar = sources.map(source => ({ source, value: overlap(game.tags, metadata.get(source.appId) ?? []) *
    (0.5 + 0.3 * Math.min(1, Math.log1p(source.minutes) / Math.log1p(1200)) + (recent.get(source.appId) ? 0.2 : 0)) }))
    .sort((a, b) => b.value - a.value || a.source.appId - b.source.appId)[0];
  const likedTags = game.tags.filter(tag => taste.likes.includes(tag));
  const avoided = game.tags.some(tag => taste.avoids.includes(tag));
  const likedGame = taste.likedGames.includes(game.appId);
  const likedSimilarity = Math.max(0, ...taste.likedGames.filter(id => id !== game.appId).map(id => overlap(game.tags, metadata.get(id) ?? [])));
  const explicit = Math.max(likedGame ? 1 : 0, likedTags.length ? 0.6 + 0.4 * likedTags.length / Math.max(1, taste.likes.length) : 0, likedSimilarity * 0.8);
  const value = clamp(Math.max(explicit, (similar?.value ?? 0) * 0.45) - (avoided ? 0.6 : 0));
  return { value, hasSignal: !!(sources.length || taste.likes.length || taste.likedGames.length || taste.avoids.length), similar,
    likedTags, avoided, likedGame };
}

// Scores compare this candidate set, not satisfaction probabilities. Explicit
// exclusions win; logarithmic playtime is a weak signal, not proof of liking.
export function rankByTaste(catalog: CatalogGame[], members: MemberSignal[], metadata: Map<number, TasteTag[]>,
  options: { kind: 'personal' | 'group'; scope: 'all' | 'any' | 'new'; solo: boolean; examples: PersonalResult['groupExamples'] }): TasteRecommendation[] {
  return catalog.flatMap(game => {
    if (members.some(member => member.taste.avoidedGames.includes(game.appId))) return [];
    const modes = game.modes.filter(mode => options.kind === 'group'
      ? mode.online && mode.min <= members.length && mode.max >= members.length
      : !options.solo || mode.min === 1);
    if (!modes.length) return [];
    const missingIds = members.filter(member => !member.games.some(owned => owned.appId === game.appId)).map(member => member.steamId);
    const owners = members.length - missingIds.length;
    if ((options.scope === 'all' && missingIds.length) || (options.scope === 'new' && !missingIds.length)) return [];
    const signals = members.map(member => affinity(game, member, metadata));
    const mean = signals.reduce((sum, signal) => sum + signal.value, 0) / signals.length;
    const minimum = Math.min(...signals.map(signal => signal.value));
    const example = options.examples.filter(example => example.appId !== game.appId).map(example => ({ example,
      value: overlap(game.tags, metadata.get(example.appId) ?? []) * (example.source === 'user-reported' ? 1 : 0.7) * example.players / members.length,
    })).sort((a, b) => b.value - a.value)[0];
    const hasSignal = signals.some(signal => signal.hasSignal) || (example?.value ?? 0) > 0;
    const base = options.kind === 'group' ? 0.6 * mean + 0.4 * minimum : mean;
    const score = hasSignal ? Math.round(100 * clamp(base * (options.kind === 'group' ? 0.75 : 1) + (example?.value ?? 0) * 0.25)) : null;
    const reasons = [owners === members.length ? '선택한 모두의 보유 목록에서 확인' : `${members.length}명 중 ${owners}명 보유 목록에서 확인`];
    const liked = signals.filter(signal => signal.likedTags.length || signal.likedGame).length;
    if (liked) reasons.push(`${liked}명의 저장한 선호와 일치`);
    if (signals.some(signal => signal.avoided)) reasons.push('일부 참여자의 피하는 장르와 겹쳐 감점');
    const similar = signals.map(signal => signal.similar).filter(signal => signal && signal.value > 0).sort((a, b) => b!.value - a!.value)[0];
    if (similar) reasons.push(`플레이한 ${similar.source.name}과 게임 특성 유사`);
    if (example && example.value > 0) reasons.push(`${example.example.source === 'user-reported' ? '사용자가 함께했다고 남긴' : '여러 멤버가 각각 플레이한'} ${example.example.name}과 유사`);
    if (!hasSignal) reasons.push('취향·플레이 근거 부족 · 개인화 점수 없음');
    const totalMinutes = members.reduce((sum, member) => sum + (member.games.find(owned => owned.appId === game.appId)?.minutes ?? 0), 0);
    return [{ ...game, modes, score, reasons, owners, missingIds, totalMinutes }];
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.owners - a.owners || a.appId - b.appId).slice(0, 12);
}
