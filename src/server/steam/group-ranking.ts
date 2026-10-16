import { emptyTaste, type TasteTag } from '../../domain/steam-personal';
import type { OwnedGame, RecentGame } from './client';
import { genreTags } from './genre-tags';
import type { Candidate } from './recommend';
import { affinity, type MemberSignal } from './taste-ranking';
import { readGroupTastes } from './tastes';
import { readSteamActivitySignals } from '../activity/steam-signals';

const defaults = { tastes: readGroupTastes, metadata: genreTags, activity: readSteamActivitySignals };

// The candidate budget is owned by recommendations.ts. At most 24 additional
// source titles, allocated round-robin so a large library cannot drown out peers.
export async function rankGroupCandidates(candidates: Candidate[], ids: string[], libraries: OwnedGame[][],
  recent: (RecentGame[] | null)[], signal?: AbortSignal, deps = defaults) {
  if (!candidates.length) return { candidates: [], sharedPreferences: 0, metadataUnavailable: 0, personalizedIds: new Set<number>() };
  const [tastes, activity] = await Promise.all([deps.tastes(ids), deps.activity(ids)]);
  const members: MemberSignal[] = ids.map((steamId, index) => ({ steamId, games: libraries[index],
    recent: recent[index] ?? null, taste: tastes.get(steamId) ?? emptyTaste(), observed: activity.get(steamId) }));
  const sources = members.map(member => [...member.games].filter(game => game.minutes > 0).sort((a, b) => {
    const recentMinutes = (id: number) => member.recent?.find(game => game.appId === id)?.minutes ?? 0;
    return recentMinutes(b.appId) - recentMinutes(a.appId) || b.minutes - a.minutes || a.appId - b.appId;
  }));
  const sourceIds = new Set<number>();
  for (let row = 0; sourceIds.size < 24 && sources.some(source => row < source.length); row++) {
    for (const source of sources) {
      if (source[row]) sourceIds.add(source[row].appId);
      if (sourceIds.size === 24) break;
    }
  }
  const lookup = [...new Set([...candidates.map(game => game.appId), ...sourceIds,
    ...members.flatMap(member => member.taste.likedGames)])];
  const metadata = new Map<number, TasteTag[]>();
  let metadataUnavailable = 0;
  for (let start = 0; start < lookup.length; start += 8) {
    signal?.throwIfAborted();
    await Promise.all(lookup.slice(start, start + 8).map(async id => {
      const tags = await deps.metadata(id);
      if (tags === null) metadataUnavailable++;
      else metadata.set(id, tags);
    }));
  }
  signal?.throwIfAborted();
  const personalizedIds = new Set<number>();
  const ranked = candidates.flatMap(candidate => {
    if (members.some(member => member.taste.avoidedGames.includes(candidate.appId))) return [];
    const signals = members.map(member => affinity({ appId: candidate.appId, tags: metadata.get(candidate.appId) ?? [] }, member, metadata));
    const values = signals.map(item => item.value);
    const mean = values.reduce((sum, value) => sum + value, 0) / members.length;
    // The least-matched person matters alongside the average; group preference
    // and observed play are blended with the selected experience criterion.
    const tasteScore = Math.round(100 * (0.6 * mean + 0.4 * Math.min(...values)));
    const hasEvidence = signals.some(item => item.hasSignal);
    if (hasEvidence) personalizedIds.add(candidate.appId);
    const score = hasEvidence ? Math.round(0.7 * tasteScore + 0.3 * candidate.score) : candidate.score;
    const reasons = [...candidate.reasons];
    if (hasEvidence) reasons.push('참여자별 플레이 특성·최근 활동과 취향의 평균 및 최소 적합도 반영');
    if (signals.some(item => item.likedTags.length || item.likedGame)) reasons.push('공통 추천 반영에 동의한 저장 취향과 일치');
    if (signals.some(item => item.avoided)) reasons.push('참여자가 피하는 장르와 겹쳐 감점');
    if (members.some(member => member.observed?.length)) reasons.push('동의 후 저장한 최근 30일 관측 증가분 반영');
    return [{ ...candidate, score, reasons }];
  }).sort((a, b) => b.score - a.score || b.owners - a.owners);
  const sharedPreferences = members.filter(member => member.taste.likes.length || member.taste.avoids.length || member.taste.likedGames.length || member.taste.avoidedGames.length).length;
  return { candidates: ranked, sharedPreferences, metadataUnavailable, personalizedIds };
}
