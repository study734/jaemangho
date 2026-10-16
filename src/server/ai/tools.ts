import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { listSteamMembers } from '../steam/roster';
import { compareGames } from '../steam/games';
import { listRoster } from '../lol/roster';
import { proxyRiot } from '../riot/proxy';
import { routeFor } from '../riot/routes';
import { contextSchema, type AiContext, type AnalysisInput } from './context';
import type { ToolDefinition } from './client';
import { personalizedGames } from '../steam/personalized';
import { recommendationFacts } from '../../domain/steam-personal';
import { steamRead, steamArguments } from './steam-tools';

const definitions = {
  get_common_games: '선택한 Steam 멤버 모두의 공통 보유 게임 조회. 멤버 선택이 없으면 선택하도록 안내한다. 협동 지원·최대 인원은 별도로 확인해야 한다.',
  get_personal_games: '내 Steam 플레이 기록과 저장한 게임 취향으로 개인 게임 추천. 내 Steam 계정 하나를 선택해야 한다. 초기 확인 카탈로그 범위와 게임 모드별 인원 근거를 반환한다.',
  get_group_games: '선택한 Steam 멤버 2~20명의 인원에 맞는 공통 게임 추천. 공유한 게임 취향과 플레이한 게임의 유사성, 사용자가 함께했다고 남긴 기록을 반영한다. 전체 Steam 검색은 아니다.',
  get_steam_library: '선택한 멤버의 공개 보유 게임과 누적 또는 최근 2주 플레이 시간을 합산 조회한다. query로 게임명 검색 가능. 여러 명의 합집합이며 공통 보유나 공동 세션이 아니다.',
  get_unplayed_games: '선택한 모두가 보유했지만 아무도 플레이하지 않은 게임 조회.',
  get_steam_recommendations: '2명 이상 선택한 멤버의 기존 Steam 추천. 경험 균형·익숙함·새로움·최근 2주와 보유 범위를 고른다. 인원 상한은 미확인일 수 있다.',
  draw_steam_game: '기존 Steam 추천 후보 중 게임 하나를 무작위로 뽑는다. previousGame을 주면 후보가 여럿일 때 직전 게임을 제외한다. 인원 상한은 미확인일 수 있다.',
  get_game_missions: '선택한 1~20명 멤버가 모두 보유한 게임의 공개 도전 과제를 조회한다. 1명은 개인 과제 조회다. game에는 정확한 Steam 게임명을 지정한다. 숨김 과제는 제외하며 협동 달성 가능성을 보장하지 않는다.',
  get_lol_records: '선택한 소환사의 랭크와 최근 최대 3경기 조회. 선택한 소환사가 없으면 선택하도록 안내한다.',
  get_activity_summary: '재망호의 최근 7일 메시지 수와 반응·답글 집계 조회. 디스코드 대화 원문은 읽지 않는다.',
};
export type ToolName = keyof typeof definitions;
export const toolDefinitions: ToolDefinition[] = Object.entries(definitions).map(([name, description]) => ({
  type: 'function', function: { name, description, parameters: z.toJSONSchema(argumentsFor(name as ToolName), { io: 'input' }) },
}));
export const toolLabels: Record<ToolName, string> = { get_steam_library: 'Steam 보유·플레이 조회', get_unplayed_games: '공통 미플레이 게임 조회', get_steam_recommendations: 'Steam 경험 기반 추천', draw_steam_game: 'Steam 게임 뽑기', get_game_missions: 'Steam 공개 도전 과제 조회', get_common_games: 'Steam 공통 게임 조회', get_personal_games: '개인 취향 게임 추천', get_group_games: '인원·취향 공통 게임 추천', get_lol_records: 'LoL 최근 전적 조회', get_activity_summary: '최근 활동 집계 조회' };
export interface ToolResult { status: 'ok' | 'selection_required'; context?: AiContext; message?: string }

// Opaque UI references never reach the model. Names/IDs stay in the app or tool adapter.
const reference = (kind: 's' | 'l', id: string) => `${kind}_${createHash('sha256').update(`${kind}:${id}`).digest('hex').slice(0, 24)}`;
export async function memberChoices() {
  const [steam, lol] = await Promise.all([listSteamMembers(), listRoster()]);
  return {
    steam: steam.slice(0, 100).map(member => ({ ref: reference('s', member.steamId), label: member.name })),
    lol: lol.slice(0, 100).map(member => ({ ref: reference('l', member.id), label: `${member.gameName}#${member.tagLine}` })),
  };
}

async function common(selection: AnalysisInput['selection']): Promise<ToolResult> {
  const refs = [...new Set(selection.steam)];
  const members = (await listSteamMembers()).filter(member => refs.includes(reference('s', member.steamId)));
  if (!refs.length || members.length !== refs.length) return { status: 'selection_required', message: 'Steam 멤버 선택이 없거나 등록 목록이 바뀌었다. 멤버·취향 설정에서 다시 선택해야 한다.' };
  const result = await compareGames(members.map(member => member.steamId), 'common');
  if ('unknownIds' in result) return { status: 'selection_required', message: '등록 목록이 바뀌었다. 다시 선택해야 한다.' };
  return { status: 'ok', context: contextSchema.parse({ topic: 'steam', mode: 'common', scope: 'all', preference: 'balanced',
    people: members.length, excluded: result.excluded.length, unverified: 0, recentUnavailable: 0,
    games: result.excluded.length ? [] : result.games.slice(0, 12).map(game => ({ name: game.name.slice(0, 160), totalMinutes: game.totalMinutes, owners: game.owners })),
  }) };
}

async function riot(path: string, region: 'asia' | 'kr', signal: AbortSignal, params = new URLSearchParams()) {
  signal.throwIfAborted();
  const route = routeFor(path);
  if (!route) throw new Error('unsupported_riot_route');
  // Reuse the existing allowlist, cache and failures. No arbitrary URL tool.
  const result = await proxyRiot({ path, region, route, params }, { apiKey: process.env.RIOT_API_KEY });
  signal.throwIfAborted();
  if (result.status !== 200) throw Object.assign(new Error('riot_unavailable'), { status: result.status });
  return result.body;
}

async function lolRecords(selection: AnalysisInput['selection'], signal: AbortSignal): Promise<ToolResult> {
  const member = (await listRoster()).find(member => reference('l', member.id) === selection.lol);
  if (!member) return { status: 'selection_required', message: '멤버·취향 설정에서 소환사를 선택해야 한다.' };
  const { puuid } = z.object({ puuid: z.string().regex(/^[\w-]+$/) }).parse(await riot(`/riot/account/v1/accounts/by-riot-id/${member.gameName}/${member.tagLine}`, 'asia', signal));
  const [rankData, matchData] = await Promise.all([
    riot(`/lol/league/v4/entries/by-puuid/${puuid}`, 'kr', signal),
    riot(`/lol/match/v5/matches/by-puuid/${puuid}/ids`, 'asia', signal, new URLSearchParams({ start: '0', count: '3' })),
  ]);
  const ranks = z.array(z.object({ queueType: z.string(), tier: z.string(), wins: z.number(), losses: z.number() })).parse(rankData);
  const rank = ranks.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
  const ids = z.array(z.string().regex(/^[A-Z0-9_]+$/)).max(3).parse(matchData);
  const matchSchema = z.object({ info: z.object({ gameDuration: z.number(), gameMode: z.string(), participants: z.array(z.object({
    puuid: z.string(), championName: z.string(), win: z.boolean(), kills: z.number(), deaths: z.number(), assists: z.number(),
    totalMinionsKilled: z.number(), neutralMinionsKilled: z.number(),
  })) }) });
  const matches = await Promise.all(ids.map(async id => {
    const { info } = matchSchema.parse(await riot(`/lol/match/v5/matches/${id}`, 'asia', signal));
    const player = info.participants.find(player => player.puuid === puuid);
    if (!player) throw new Error('missing_match_player');
    return { champion: player.championName, win: player.win, kills: player.kills, deaths: player.deaths, assists: player.assists,
      cs: player.totalMinionsKilled + player.neutralMinionsKilled, seconds: info.gameDuration, mode: info.gameMode };
  }));
  return { status: 'ok', context: contextSchema.parse({ topic: 'lol', view: 'overview', duos: [], players: [{ player: 1,
    tier: rank?.tier ?? 'UNRANKED', wins: rank?.wins ?? 0, losses: rank?.losses ?? 0, detailsLoaded: true, detailsUnavailable: false, matches, masteries: [],
  }] }) };
}

async function activity(): Promise<ToolResult> {
  const sql = await db();
  const [[total], highlights] = await Promise.all([
    sql`select count(*)::int as total from chat_messages where created_at >= now() - interval '7 days'`,
    sql`select reactions, replies, created_at from chat_highlights where created_at >= now() - interval '7 days' order by created_at desc limit 5`,
  ]);
  return { status: 'ok', context: contextSchema.parse({ topic: 'activity', period: 'recent-seven-days', totalMessages: total.total,
    highlights: highlights.map(row => ({ reactions: row.reactions, replies: row.replies, at: new Date(row.created_at as string).toISOString() })), moments: [], awards: [], unavailable: false,
  }) };
}

function argumentsFor(name: ToolName) {
  if (name === 'get_personal_games' || name === 'get_group_games') return z.object({ scope: z.enum(['all', 'any', 'new']).optional(), ...(name === 'get_personal_games' ? { solo: z.boolean().optional() } : {}) }).strict();
  return steamArguments[name as keyof typeof steamArguments] ?? z.object({}).strict();
}
export function parseTool(name: string, args: string) {
  if (!Object.hasOwn(definitions, name)) throw new Error('unsupported_tool');
  return { name: name as ToolName, args: argumentsFor(name as ToolName).parse(JSON.parse(args)) };
}

export async function readTool(name: ToolName, selection: AnalysisInput['selection'], signal: AbortSignal, userId?: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  signal.throwIfAborted();
  const parsed = argumentsFor(name).parse(args);
  if (Object.hasOwn(steamArguments, name)) {
    const refs = [...new Set(selection.steam)];
    const members = (await listSteamMembers()).filter(member => refs.includes(reference('s', member.steamId)));
    signal.throwIfAborted();
    if (!refs.length || members.length !== refs.length) return { status: 'selection_required', message: '멤버·취향 설정에서 Steam 멤버를 다시 선택해야 한다.' };
    return steamRead(name, members.map(member => member.steamId), parsed, signal);
  }
  if (name === 'get_personal_games' || name === 'get_group_games') {
    const refs = [...new Set(selection.steam)];
    const members = (await listSteamMembers()).filter(member => refs.includes(reference('s', member.steamId)));
    const personal = name === 'get_personal_games';
    if (!userId || members.length !== refs.length || (personal ? members.length !== 1 || members[0].ownerId !== userId : members.length < 2))
      return { status: 'selection_required', message: personal ? '멤버·취향 설정에서 본인에게 연결된 Steam 계정 하나를 선택해야 한다. 게임 취향은 Steam 개인 취향·공통 추천 화면에서 설정한다.' : '멤버·취향 설정에서 함께할 Steam 멤버를 2명 이상 선택해야 한다.' };
    const options = parsed as { scope?: 'all' | 'any' | 'new'; solo?: boolean };
    const result = await personalizedGames(userId, { kind: personal ? 'personal' : 'group', ids: members.map(member => member.steamId), scope: options.scope ?? 'any', solo: options.solo ?? false }, signal);
    signal.throwIfAborted();
    return { status: 'ok', context: contextSchema.parse({ ...recommendationFacts(result), scope: options.scope === 'new' ? 'unowned' : options.scope ?? 'any' }), message: `공식 인원을 확인한 초기 ${result.catalogSize}개 카탈로그의 추천이다. 전체 Steam 검색이 아니다. 사용한 저장 취향은 ${result.sharedPreferences}명이다. 재순이 대화 메모는 순위 계산에 사용하지 않는다.` };
  }
  if (name === 'get_common_games') return common(selection);
  if (name === 'get_lol_records') return lolRecords(selection, signal);
  return activity();
}
