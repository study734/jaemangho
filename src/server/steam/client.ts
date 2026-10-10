import { z } from 'zod';
import { steamCacheGet, steamCachePut, steamStat } from './cache';

// Steam Web API 클라이언트. 키는 서버에서만 쓰고 어디에도 출력하지 않는다.
const BASE = 'https://api.steampowered.com';

export class SteamNotConfiguredError extends Error {
  constructor() {
    super('STEAM_API_KEY is not set');
  }
}
export class SteamUpstreamError extends Error {
  status: number;
  constructor(status: number) {
    super(`Steam API error (${status})`);
    this.status = status;
  }
}
// 200인데 본문 형식이 깨진 경우. 라우트에서는 외부 서비스 오류(502)로 처리한다.
export class SteamPayloadError extends SteamUpstreamError {
  constructor() {
    super(200);
    this.message = 'Steam response schema mismatch';
  }
}

const inFlight = new Map<string, Promise<unknown>>();
const MAX_UPSTREAM_CONCURRENCY = 4;
let activeUpstream = 0;
const upstreamWaiters: Array<() => void> = [];

async function withUpstreamSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeUpstream < MAX_UPSTREAM_CONCURRENCY) activeUpstream++;
  else await new Promise<void>(resolve => upstreamWaiters.push(resolve));
  try { return await work(); }
  finally {
    const next = upstreamWaiters.shift();
    if (next) next(); // 점유한 슬롯을 다음 요청에 넘긴다.
    else activeUpstream--;
  }
}

async function call(path: string, params: Record<string, string>, schema: z.ZodType, cacheable: (body: unknown) => boolean = () => true): Promise<unknown> {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new SteamNotConfiguredError();
  const cacheKey = `${path}?${new URLSearchParams(params)}`; // API 키는 DB에 저장하지 않는다.
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;
  const work = (async () => {
    const cached = await steamCacheGet(cacheKey);
    if (cached !== undefined && schema.safeParse(cached).success && cacheable(cached)) {
      await steamStat('hit');
      return cached;
    }
    await steamStat('miss');
    try {
      const url = `${BASE}${path}?${new URLSearchParams({ key, ...params })}`;
      const body: unknown = await withUpstreamSlot(async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
        if (!res.ok) throw new SteamUpstreamError(res.status);
        return res.json();
      });
      if (!schema.safeParse(body).success) throw new SteamPayloadError();
      const ttl = path.includes('GetSchemaForGame') ? 86400 : /Get(?:Owned|RecentlyPlayed)Games/.test(path) ? 300 : 900;
      if (cacheable(body)) await steamCachePut(cacheKey, body, ttl);
      return body;
    } catch (error) {
      await steamStat('error', path, error instanceof SteamPayloadError ? 'invalid_response' : error instanceof SteamUpstreamError ? String(error.status) : 'network');
      throw error;
    }
  })();
  inFlight.set(cacheKey, work);
  try { return await work; } finally { inFlight.delete(cacheKey); }
}

const recentSchema = z.object({ response: z.object({
  total_count: z.number().int().nonnegative().optional(),
  games: z.array(z.object({ appid: z.number().int().positive(), name: z.string().optional(), playtime_2weeks: z.number().int().nonnegative() })).optional(),
}) });
export interface RecentGame { appId: number; minutes: number }
export type RecentLibrary = { ok: true; games: RecentGame[] } | { ok: false };

export async function getRecentGames(steamId: string): Promise<RecentLibrary> {
  const body = recentSchema.parse(await call('/IPlayerService/GetRecentlyPlayedGames/v1/', { steamid: steamId, count: '0' }, recentSchema));
  if (!body.response.games && body.response.total_count !== 0) return { ok: false };
  return { ok: true, games: (body.response.games ?? []).map(game => ({ appId: game.appid, minutes: game.playtime_2weeks })) };
}

const achievementSchema = z.object({ game: z.object({ availableGameStats: z.object({
  achievements: z.array(z.object({ name: z.string().min(1), displayName: z.string().min(1),
    description: z.string().optional(), hidden: z.number().int().min(0).max(1).optional(),
  })).optional(),
}).optional() }) });
export interface AchievementDefinition { id: string; title: string; description: string | null; hidden: boolean }
export async function getAchievementDefinitions(appId: number): Promise<AchievementDefinition[]> {
  const body = achievementSchema.parse(await call('/ISteamUserStats/GetSchemaForGame/v2/', { appid: String(appId), l: 'koreana' }, achievementSchema));
  return (body.game.availableGameStats?.achievements ?? []).map(achievement => ({ id: achievement.name,
    title: achievement.displayName, description: achievement.description ?? null, hidden: achievement.hidden !== 0,
  }));
}

const progressSchema = z.object({ playerstats: z.object({
  success: z.boolean(), achievements: z.array(z.object({ apiname: z.string(), achieved: z.union([z.literal(0), z.literal(1)]) })).optional(),
}) });
export type AchievementProgress = { ok: true; achievements: { id: string; unlocked: boolean }[] } | { ok: false };
export async function getAchievementProgress(steamId: string, appId: number): Promise<AchievementProgress> {
  const cacheable = (body: unknown) => {
    const parsed = progressSchema.safeParse(body);
    return parsed.success && parsed.data.playerstats.success && parsed.data.playerstats.achievements !== undefined;
  };
  const body = progressSchema.parse(await call('/ISteamUserStats/GetPlayerAchievements/v1/',
    { steamid: steamId, appid: String(appId), l: 'koreana' }, progressSchema, cacheable));
  if (!body.playerstats.success || !body.playerstats.achievements) return { ok: false };
  return { ok: true, achievements: body.playerstats.achievements.map(achievement => ({ id: achievement.apiname, unlocked: achievement.achieved === 1 })) };
}

// 입력: 17자리 SteamID, steamcommunity.com/profiles/<id>, steamcommunity.com/id/<이름>, 또는 이름만
export type SteamInput = { kind: 'id'; steamId: string } | { kind: 'vanity'; vanity: string };

export function parseSteamInput(raw: string): SteamInput | null {
  const s = raw.trim();
  if (/^\d{17}$/.test(s)) return { kind: 'id', steamId: s };
  const m = s.match(/^(?:https?:\/\/)?steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i);
  if (m) {
    const [, type, value] = m;
    if (type.toLowerCase() === 'profiles') return /^\d{17}$/.test(value) ? { kind: 'id', steamId: value } : null;
    return /^[\w-]{2,32}$/.test(value) ? { kind: 'vanity', vanity: value } : null;
  }
  return /^[\w-]{2,32}$/.test(s) ? { kind: 'vanity', vanity: s } : null;
}

const vanitySchema = z.object({ response: z.object({ success: z.number(), steamid: z.string().optional() }) });

export async function resolveSteamId(input: SteamInput): Promise<string | null> {
  if (input.kind === 'id') return input.steamId;
  const parsed = vanitySchema.safeParse(await call('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: input.vanity }, vanitySchema));
  return parsed.success && parsed.data.response.success === 1 ? (parsed.data.response.steamid ?? null) : null;
}

const playersSchema = z.object({
  response: z.object({ players: z.array(z.object({ steamid: z.string(), personaname: z.string(), avatarfull: z.string().optional() })) }),
});
export interface SteamProfile {
  steamId: string;
  name: string;
  avatar: string | null;
}

export async function getProfile(steamId: string): Promise<SteamProfile | null> {
  const parsed = playersSchema.safeParse(await call('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }, playersSchema));
  const p = parsed.success ? parsed.data.response.players[0] : undefined;
  return p ? { steamId: p.steamid, name: p.personaname, avatar: p.avatarfull ?? null } : null;
}

const ownedSchema = z.object({
  response: z.object({
    games: z.array(z.object({ appid: z.number(), name: z.string().optional(), playtime_forever: z.number() })).optional(),
  }),
});
export interface OwnedGame {
  appId: number;
  name: string;
  minutes: number;
}
// games가 없으면 비공개 프로필(게임 세부 정보 비공개)로 본다. 정말 0개인 계정과도 구분되지 않는다.
export type Library = { ok: true; games: OwnedGame[] } | { ok: false };

export async function getLibrary(steamId: string): Promise<Library> {
  const parsed = ownedSchema.safeParse(
    await call('/IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' }, ownedSchema)
  );
  const games = parsed.success ? parsed.data.response.games : undefined;
  if (!games?.length) return { ok: false };
  return { ok: true, games: games.map((g) => ({ appId: g.appid, name: g.name ?? `App ${g.appid}`, minutes: g.playtime_forever })) };
}
