import { z } from 'zod';
import { db } from './db';
import { getProfile } from './steam/client';

const DISCORD = 'https://discord.com/api';

export interface SteamConnection {
  id: string; // SteamID64
  name: string;
}

const connectionsSchema = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), revoked: z.boolean().optional() }));

// 사용자가 디스코드에 연결해 둔 Steam 계정. 연결 목록 권한(connections)이 없거나 호출이 실패하면 빈 목록이다
// (로그인을 막지 않는다). id가 17자리 SteamID가 아닌 항목은 우리 형식과 달라 건너뛴다.
export async function fetchSteamConnections(accessToken: string, fetchFn: typeof fetch = fetch): Promise<SteamConnection[]> {
  try {
    const res = await fetchFn(`${DISCORD}/users/@me/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const parsed = connectionsSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    const steam = parsed.data.filter((c) => c.type === 'steam' && !c.revoked);
    const usable = steam.filter((c) => /^\d{17}$/.test(c.id));
    // 값은 남기지 않는다. 배포 후 Steam 연결이 있는데 하나도 못 쓰면 형식이 다르다는 단서가 된다.
    if (steam.length > usable.length) console.warn(`discord steam connection ids with unexpected format: ${steam.length - usable.length}`);
    return usable.map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
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
