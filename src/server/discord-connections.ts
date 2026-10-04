import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { getProfile } from './steam/client';

const DISCORD = 'https://discord.com/api';

export interface SteamConnection {
  id: string; // SteamID64
  name: string;
}
export interface RiotConnection {
  gameName: string;
  tagLine: string;
}
export interface Connections {
  steam: SteamConnection[];
  riot: RiotConnection[];
}
const NONE: Connections = { steam: [], riot: [] };

const connectionsSchema = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), revoked: z.boolean().optional() }));

// 공식 문서의 서비스 목록에는 Riot이 없다. 앱에서는 Riot 계정 연결이 보이므로, 아래 두 이름 중 하나로 오면 쓰고
// 이름이 "게임이름#태그"로 읽힐 때만 받아들인다. 실제로 어떤 종류가 오는지는 로그의 종류 이름으로 확인한다.
const RIOT_TYPES = new Set(['riotgames', 'leagueoflegends']);
const RIOT_ID = /^(.{1,32})#([A-Za-z0-9]{1,16})$/;

// 사용자가 디스코드에 연결해 둔 Steam·Riot 계정. 연결 목록 권한(connections)이 없거나 호출이 실패하면 빈 목록이다
// (로그인을 막지 않는다). Steam id가 17자리 SteamID가 아니면 우리 형식과 달라 건너뛴다.
export async function fetchConnections(accessToken: string, fetchFn: typeof fetch = fetch): Promise<Connections> {
  try {
    const res = await fetchFn(`${DISCORD}/users/@me/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NONE;
    const parsed = connectionsSchema.safeParse(await res.json());
    if (!parsed.success) return NONE;
    const live = parsed.data.filter((c) => !c.revoked);

    // 값(계정 이름, id)은 남기지 않고 종류와 개수만 남긴다.
    console.info(`discord connection types: ${[...new Set(live.map((c) => c.type))].sort().join(',') || '(none)'}`);

    const steam = live.filter((c) => c.type === 'steam');
    const usableSteam = steam.filter((c) => /^\d{17}$/.test(c.id));
    if (steam.length > usableSteam.length) console.warn(`discord steam connection ids with unexpected format: ${steam.length - usableSteam.length}`);

    const riot = live.filter((c) => RIOT_TYPES.has(c.type));
    const usableRiot = riot.flatMap((c) => {
      const m = RIOT_ID.exec(c.name.trim());
      return m ? [{ gameName: m[1].trim(), tagLine: m[2] }] : [];
    });
    if (riot.length > usableRiot.length) console.warn(`discord riot connection names not in Name#TAG format: ${riot.length - usableRiot.length}`);

    return { steam: usableSteam.map((c) => ({ id: c.id, name: c.name })), riot: usableRiot };
  } catch {
    return NONE;
  }
}

type LookupProfile = (steamId: string) => Promise<{ name: string; avatar: string | null } | null>;
const steamProfile: LookupProfile = async (id) => {
  try {
    return await getProfile(id); // STEAM_API_KEY가 없거나 호출이 실패하면 던진다 -> 아래에서 연결 이름으로 대신한다
  } catch {
    return null;
  }
};

// 연결된 Steam 계정을 그 사용자의 멤버 계정으로 묶는다.
// - 이미 등록된 계정이면 주인이 비어 있을 때만 주인으로 지정한다(다른 사람의 계정을 가로채지 않는다).
// - 없으면 새로 등록한다. 이름과 아바타는 Steam에서 받고, 못 받으면 연결에 적힌 이름을 쓴다.
export async function linkSteamAccounts(userId: string, connections: SteamConnection[], lookup: LookupProfile = steamProfile) {
  const sql = await db();
  for (const c of connections) {
    const profile = await lookup(c.id);
    await sql`insert into steam_members (steam_id, persona_name, avatar, created_by, created_by_name, owner_id)
      values (${c.id}, ${profile?.name ?? c.name}, ${profile?.avatar ?? null}, ${userId}, (select name from "user" where id = ${userId}), ${userId})
      on conflict (steam_id) do update set owner_id = excluded.owner_id where steam_members.owner_id is null`;
  }
}

// 연결된 롤 계정을 그 사용자의 멤버 계정으로 묶는다. 같은 Riot ID(대소문자 무시)가 이미 있으면
// 주인이 비어 있을 때만 주인으로 지정한다. 없으면 새로 등록한다(전적은 롤 화면이 Riot에서 받아 채운다).
export async function linkRiotAccounts(userId: string, accounts: RiotConnection[]) {
  const sql = await db();
  for (const a of accounts) {
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    await sql`insert into members (id, game_name, tag_line, created_by, created_by_name, owner_id)
      values (${id}, ${a.gameName}, ${a.tagLine}, ${userId}, (select name from "user" where id = ${userId}), ${userId})
      on conflict (lower(game_name), lower(tag_line)) do update set owner_id = excluded.owner_id where members.owner_id is null`;
  }
}

// 로그인 훅이 부르는 진입점. 한쪽이 실패해도 다른 쪽은 계속한다(호출하는 쪽이 실패를 로그로만 남긴다).
export async function linkConnections(userId: string, c: Connections) {
  const results = await Promise.allSettled([linkSteamAccounts(userId, c.steam), linkRiotAccounts(userId, c.riot)]);
  for (const r of results) if (r.status === 'rejected') console.error('discord connection link failed', r.reason);
}
