import { z } from 'zod';
import { getLibrary, getRecentGames } from '../steam/client';
import { compareGames } from '../steam/games';
import { recommendGames } from '../steam/recommendations';
import { findMissions } from '../steam/missions';
import { recommendationCatalog } from '../steam/catalog';
import { contextSchema } from './context';
import type { ToolResult } from './tools';

const query = z.string().trim().max(160).optional();
const recommendationArgs = z.object({
  preference: z.enum(['balanced', 'familiar', 'fresh', 'recent']).describe('balanced=경험 균형, familiar=익숙한 게임, fresh=새로 해 볼 게임, recent=최근 2주 플레이').optional(),
  scope: z.enum(['all', 'any', 'unowned']).describe('all=선택한 모두 보유, any=일부만 보유해도 포함, unowned=아무도 보유하지 않음').optional(),
}).strict();
export const steamArguments = {
  get_steam_library: z.object({ sort: z.enum(['total', 'recent']).describe('total=누적 플레이 시간순, recent=최근 2주 시간순').optional(), query }).strict(),
  get_unplayed_games: z.object({}).strict(),
  get_steam_recommendations: recommendationArgs,
  draw_steam_game: recommendationArgs.extend({ previousGame: z.string().trim().max(160).describe('후보가 여러 개일 때 제외할 직전 게임의 정확한 이름. 예: Portal 2').optional() }).strict(),
  get_game_missions: z.object({ game: z.string().trim().min(1).max(160) }).strict(),
};
const normalized = (name: string) => name.normalize('NFKC').toLowerCase();
const selectionRequired = (message: string): ToolResult => ({ status: 'selection_required', message });
const countsFor = (appId: number) => {
  const game = recommendationCatalog.find(game => game.appId === appId);
  return game ? { modes: game.modes, sourceCheckedAt: game.checkedAt } : {};
};

// This adapter exposes bounded display facts only. Account IDs and private tastes
// never enter the tool result; existing Steam services own caches and failures.
export async function steamRead(name: string, ids: string[], args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
  signal.throwIfAborted();
  const base = { topic: 'steam', mode: 'common', scope: 'all', preference: 'balanced', people: ids.length, excluded: 0, unverified: 0, recentUnavailable: 0, games: [] };
  const finish = (facts: Record<string, unknown>, message?: string): ToolResult => {
    signal.throwIfAborted();
    return { status: 'ok', context: contextSchema.parse({ ...base, ...facts }), ...(message ? { message } : {}) };
  };
  if (name === 'get_steam_library') {
    const { sort = 'total', query = '' } = steamArguments.get_steam_library.parse(args);
    const libraries = await Promise.all(ids.map(id => getLibrary(id)));
    signal.throwIfAborted();
    const excluded = libraries.filter(library => !library.ok).length;
    if (excluded) return finish({ mode: 'library', excluded }, '보유 목록을 확인하지 못한 멤버가 있어 합산을 보류했다. 비공개 또는 조회 불가이며 게임 없음이 아니다.');
    const recent = sort === 'recent' ? await Promise.all(ids.map(id => getRecentGames(id))) : [];
    signal.throwIfAborted();
    const recentUnavailable = recent.filter(result => !result.ok).length;
    if (recentUnavailable) return finish({ mode: 'recent', recentUnavailable }, '최근 기록 일부를 확인하지 못해 합산을 보류했다. 플레이하지 않았다는 뜻이 아니다.');
    const games = new Map<number, { appId: number; name: string; totalMinutes: number; owners: number; recentMinutes: number }>();
    libraries.forEach((library, index) => {
      if (!library.ok) return;
      const activity = recent[index];
      const minutes = new Map(activity?.ok ? activity.games.map(game => [game.appId, game.minutes]) : []);
      for (const game of new Map(library.games.map(game => [game.appId, game])).values()) {
        const prior = games.get(game.appId) ?? { appId: game.appId, name: game.name, totalMinutes: 0, owners: 0, recentMinutes: 0 };
        games.set(game.appId, { ...prior, owners: prior.owners + 1, totalMinutes: prior.totalMinutes + game.minutes, recentMinutes: prior.recentMinutes + (minutes.get(game.appId) ?? 0) });
      }
    });
    const results = [...games.values()].filter(game => normalized(game.name).includes(normalized(query)) && (sort !== 'recent' || game.recentMinutes > 0))
      .sort((a, b) => sort === 'recent' ? b.recentMinutes - a.recentMinutes || a.appId - b.appId : b.totalMinutes - a.totalMinutes || a.appId - b.appId);
    return finish({ mode: sort === 'recent' ? 'recent' : 'library', scope: 'any', games: results.slice(0, 12).map(game => ({ ...game, name: game.name.slice(0, 160) })) }, `선택한 공개 보유 목록의 합집합이다. 검색에 맞는 ${results.length}개 중 최대 12개다. 최근 기록은 보유 목록에서 이름을 확인한 게임 범위다. 공동 플레이 세션의 증명이 아니다.`);
  }
  if (name === 'get_unplayed_games' || name === 'get_game_missions') {
    const result = await compareGames(ids, name === 'get_unplayed_games' ? 'unplayed' : 'common');
    signal.throwIfAborted();
    if ('unknownIds' in result) return selectionRequired('등록 목록이 바뀌었다. Steam 멤버를 다시 선택해야 한다.');
    if (result.excluded.length) return finish({ excluded: result.excluded.length }, '일부 보유 목록을 확인하지 못해 비교를 보류했다.');
    if (name === 'get_unplayed_games') return finish({ mode: 'unplayed', games: result.games.slice(0, 12).map(game => ({ ...game, name: game.name.slice(0, 160), ...countsFor(game.appId) })) });
    const { game } = steamArguments.get_game_missions.parse(args);
    const matches = result.games.filter(entry => normalized(entry.name) === normalized(game));
    if (matches.length !== 1) return selectionRequired(`공통 보유 게임에서 정확히 한 게임을 찾지 못했다. Steam의 정확한 게임명을 물어봐야 한다. 공통 보유 예시: ${result.games.slice(0, 6).map(game => game.name.slice(0, 160)).join(', ') || '없음'}`);
    const missions = await findMissions(ids, matches[0].appId, signal);
    if ('unknownIds' in missions) return selectionRequired('등록 목록이 바뀌었다. Steam 멤버를 다시 선택해야 한다.');
    return finish({ mode: 'missions', games: [{ ...matches[0], name: matches[0].name.slice(0, 160), ...countsFor(matches[0].appId) }], missions: {
      game: matches[0].name.slice(0, 160), state: missions.state, unknownAchievements: missions.unknownAchievements, unavailable: missions.unavailableIds.length,
      goals: missions.missions.slice(0, 12).map(goal => ({ title: goal.title.slice(0, 160), kind: goal.kind, remaining: goal.lockedIds.length })),
    } }, '공개 과제의 달성 현황만 조회했다. 함께 달성 가능한 과제인지 Steam 데이터로 보장하지 않는다.');
  }
  if (ids.length < 2) return selectionRequired('멤버·취향 설정에서 함께할 Steam 멤버를 2명 이상 선택해야 한다.');
  const { preference = 'balanced', scope = 'all', previousGame } = steamArguments.draw_steam_game.parse(args);
  const result = await recommendGames(ids, preference, scope, signal);
  if ('unknownIds' in result) return selectionRequired('등록 목록이 바뀌었다. Steam 멤버를 다시 선택해야 한다.');
  signal.throwIfAborted();
  // Exclude known incompatible party sizes; never infer unknown limits from tags.
  let games = result.excluded.length ? [] : result.games.filter(game => {
    const catalog = recommendationCatalog.find(entry => entry.appId === game.appId);
    return !catalog || catalog.modes.some(mode => mode.online && mode.min <= ids.length && mode.max >= ids.length);
  });
  const candidates = games.length;
  if (name === 'draw_steam_game' && games.length) {
    const alternatives = previousGame ? games.filter(game => normalized(game.name) !== normalized(previousGame)) : games;
    const pool = alternatives.length ? alternatives : games;
    games = [pool[Math.floor(Math.random() * pool.length)]];
  }
  return finish({ mode: name === 'draw_steam_game' ? 'draw' : 'recommendations', scope, preference,
    excluded: result.excluded.length, unverified: result.unverified, recentUnavailable: result.recentUnavailable.length,
    games: games.map(game => ({ name: game.name.slice(0, 160), totalMinutes: game.totalMinutes, owners: game.owners, score: game.score,
      support: game.support, minMinutes: game.minMinutes, maxMinutes: game.maxMinutes, recentMinutes: game.recentMinutes,
      recommendationReasons: game.reasons, ...countsFor(game.appId) })),
  }, `${result.totalCandidates}개 중 ${result.checked}개 지원 확인, 인원 확인된 부적합 게임을 뺀 ${candidates}개 후보. 인원 정보 없는 게임의 최소·최대 인원은 미확인이다. 미보유 추천은 인기·신규 목록 범위다. 뽑기는 이 후보 안에서만 무작위이며 직전 게임은 대화에서 전달된 값이다.`);
}
