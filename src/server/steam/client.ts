import { z } from 'zod';

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

async function call(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new SteamNotConfiguredError();
  const url = `${BASE}${path}?${new URLSearchParams({ key, ...params })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!res.ok) throw new SteamUpstreamError(res.status);
  return res.json();
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
  const parsed = vanitySchema.safeParse(await call('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: input.vanity }));
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
  const parsed = playersSchema.safeParse(await call('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }));
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
    await call('/IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' })
  );
  const games = parsed.success ? parsed.data.response.games : undefined;
  if (!games?.length) return { ok: false };
  return { ok: true, games: games.map((g) => ({ appId: g.appid, name: g.name ?? `App ${g.appid}`, minutes: g.playtime_forever })) };
}
