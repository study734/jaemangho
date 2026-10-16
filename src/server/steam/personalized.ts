import { z } from 'zod';
import { emptyTaste, type PersonalResult, type TasteTag } from '../../domain/steam-personal';
import { recommendationCatalog } from './catalog';
import { getLibrary, getRecentGames, SteamUpstreamError } from './client';
import { genreTags } from './genre-tags';
import { rankByTaste, type MemberSignal } from './taste-ranking';
import { listSteamMembers, steamIdSchema } from './roster';
import { readTaste, sharedTastes, TasteInputError } from './tastes';

export const personalizedSchema = z.object({ kind: z.enum(['personal', 'group']),
  ids: z.array(steamIdSchema).min(1).max(20).transform(ids => [...new Set(ids)]),
  scope: z.enum(['all', 'any', 'new']).default('any'), solo: z.boolean().default(false),
}).strict();
export type PersonalInput = z.infer<typeof personalizedSchema>;
const defaults = { members: listSteamMembers, library: getLibrary, recent: getRecentGames, metadata: genreTags,
  ownTaste: readTaste, shared: sharedTastes };

export function createPersonalizedService(deps = defaults, budgetMs = 25_000) {
  return async (userId: string, input: PersonalInput, parentSignal?: AbortSignal): Promise<PersonalResult> => {
    const deadline = AbortSignal.timeout(budgetMs);
    const signal = parentSignal ? AbortSignal.any([deadline, parentSignal]) : deadline;
    if (signal.aborted) throw new SteamUpstreamError(504);
    const work = async (): Promise<PersonalResult> => {
      const all = await deps.members();
      const members = input.ids.map(id => all.find(member => member.steamId === id));
      if (members.some(member => !member)) throw new TasteInputError('등록된 Steam 멤버를 다시 선택해 주세요.');
      const selected = members.filter(member => !!member);
      const owners = selected.flatMap(member => member.ownerId ? [member.ownerId] : []);
      if (new Set(owners).size !== owners.length) throw new TasteInputError('같은 멤버에게 연결된 Steam 계정은 하나만 선택해 주세요.');
      if (input.kind === 'personal' && (selected.length !== 1 || selected[0].ownerId !== userId)) throw new TasteInputError('개인 추천은 내 연결 Steam 계정 하나를 선택해 주세요.');
      if (input.kind === 'group' && selected.length < 2) throw new TasteInputError('공통 추천은 2명 이상 선택해 주세요.');
      const [own, shared] = await Promise.all([deps.ownTaste(userId), deps.shared(selected.flatMap(member => member.ownerId ? [member.ownerId] : []))]);
      signal.throwIfAborted();
      const recentUnavailable: string[] = [], excluded: string[] = [];
      const signals = await Promise.all(selected.map(async member => {
        const [library, recent] = await Promise.all([deps.library(member.steamId), deps.recent(member.steamId).catch(() => ({ ok: false as const }))]);
        if (!library.ok) excluded.push(member.steamId);
        if (!recent.ok) recentUnavailable.push(member.steamId);
        return { steamId: member.steamId, games: library.ok ? library.games : [], recent: recent.ok ? recent.games : null,
          taste: member.ownerId === userId ? own : shared.get(member.ownerId ?? '') ?? emptyTaste() } satisfies MemberSignal;
      }));
      signal.throwIfAborted();
      const base: PersonalResult = { kind: input.kind, games: [], excluded, recentUnavailable, people: selected.length,
        sharedPreferences: signals.filter(member => member.taste.likes.length || member.taste.avoids.length || member.taste.likedGames.length || member.taste.avoidedGames.length || member.taste.together.length).length,
        catalogSize: recommendationCatalog.length, sourceGames: 0, metadataUnavailable: 0, groupExamples: [], capturedAt: new Date().toISOString() };
      if (excluded.length) return base; // Never turn partial ownership into a full-group recommendation.
      const played = new Map<number, { appId: number; name: string; players: number; minutes: number }>();
      for (const member of signals) for (const game of new Map(member.games.filter(game => game.minutes > 0).map(game => [game.appId, game])).values()) {
        const item = played.get(game.appId) ?? { ...game, minutes: 0, players: 0 };
        played.set(game.appId, { ...item, players: item.players + 1, minutes: item.minutes + game.minutes });
      }
      // At most 24 source titles; four new store requests at a time. A single
      // enormous library or 20 selected members cannot expand this budget.
      const sourceIds = [...played.values()].sort((a, b) => b.players - a.players || b.minutes - a.minutes || a.appId - b.appId).slice(0, 24).map(game => game.appId);
      const explicit = signals.flatMap(member => member.taste.likedGames);
      const ids = [...new Set([...recommendationCatalog.map(game => game.appId), ...sourceIds, ...explicit])];
      const metadata = new Map<number, TasteTag[]>();
      for (let start = 0; start < ids.length; start += 4) {
        signal.throwIfAborted();
        await Promise.all(ids.slice(start, start + 4).map(async id => {
          const tags = await deps.metadata(id);
          if (tags === null) base.metadataUnavailable++;
          else if (tags.length) metadata.set(id, tags);
        }));
      }
      signal.throwIfAborted();
      base.sourceGames = sourceIds.filter(id => metadata.has(id)).length;
      if (input.kind === 'group') {
        const reports = signals.flatMap(member => member.taste.together).filter(record =>
          record.steamIds.every(id => all.some(member => member.steamId === id)) && record.steamIds.filter(id => input.ids.includes(id)).length >= 2);
        const examples = [...played.values()].filter(game => game.players >= 2 && metadata.has(game.appId)).sort((a, b) => b.players - a.players || b.minutes - a.minutes).map(game => ({ appId: game.appId, name: game.name, players: game.players, source: 'steam-overlap' as const }));
        for (const record of reports) {
          const game = recommendationCatalog.find(game => game.appId === record.appId);
          if (game) {
            const prior = examples.findIndex(example => example.appId === game.appId);
            if (prior >= 0) examples.splice(prior, 1);
          }
        }
        base.groupExamples = [...reports.flatMap(record => {
          const game = recommendationCatalog.find(game => game.appId === record.appId);
          return game ? [{ appId: game.appId, name: game.name, players: record.steamIds.filter(id => input.ids.includes(id)).length, source: 'user-reported' as const }] : [];
        }), ...examples].filter((example, i, array) => array.findIndex(other => other.appId === example.appId && other.source === example.source) === i).slice(0, 12);
      }
      base.games = rankByTaste(recommendationCatalog, signals, metadata, { ...input, examples: base.groupExamples });
      return base;
    };
    // Existing shared Steam calls may finish into their cache; late results never
    // start another stage or replace this response. No retry or inference call.
    return new Promise((resolve, reject) => {
      const abort = () => reject(new SteamUpstreamError(504));
      signal.addEventListener('abort', abort, { once: true });
      work().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  };
}
export const personalizedGames = createPersonalizedService();
