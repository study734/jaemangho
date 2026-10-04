import { db } from '../db';
import type { ConnectionHandler } from '../discord-connections';
import { getProfile } from './client';

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
export async function linkSteamAccounts(userId: string, accounts: { id: string; name: string }[], lookup: LookupProfile = steamProfile) {
  const sql = await db();
  for (const c of accounts) {
    const profile = await lookup(c.id);
    await sql`insert into steam_members (steam_id, persona_name, avatar, created_by, created_by_name, owner_id)
      values (${c.id}, ${profile?.name ?? c.name}, ${profile?.avatar ?? null}, ${userId}, (select name from "user" where id = ${userId}), ${userId})
      on conflict (steam_id) do update set owner_id = excluded.owner_id where steam_members.owner_id is null`;
  }
}

export const steamConnection: ConnectionHandler = {
  name: 'steam',
  types: ['steam'],
  async link(userId, connections) {
    // id가 17자리 SteamID가 아니면 우리 형식과 달라 건너뛴다
    const usable = connections.filter((c) => /^\d{17}$/.test(c.id));
    if (usable.length < connections.length) console.warn(`discord steam connection ids with unexpected format: ${connections.length - usable.length}`);
    await linkSteamAccounts(userId, usable);
  },
};
