import { db } from '../db';
import type { OwnershipScope, Preference } from '../steam/recommend';

// 친구 선택 한 번 = 파티 하나. 버튼은 파티 id만 담고, 친구 목록은 여기서 다시 읽는다.
// 디스코드 id만 저장하고 Steam 계정은 버튼을 누를 때마다 다시 확인한다(연결 변경·차단 즉시 반영).
export interface Party { id: string; ownerId: string; discordIds: string[]; scope: OwnershipScope; preference: Preference }
const TTL = '1 day';

export async function saveParty(party: Party) {
  const sql = await db();
  await sql`delete from discord_parties where created_at < now() - ${TTL}::interval`;
  // 같은 선택 interaction이 다시 와도(Discord 재전송) 같은 파티를 쓴다.
  await sql`insert into discord_parties (id, owner_discord_id, discord_ids, scope, preference)
    values (${party.id}, ${party.ownerId}, ${party.discordIds}, ${party.scope}, ${party.preference}) on conflict (id) do nothing`;
}

// 만료됐거나 다른 사람의 파티면 null. 본인 확인은 Discord가 서명한 member id로 한다.
export async function loadParty(id: string, ownerId: string): Promise<Party | null> {
  const sql = await db();
  const [row] = await sql`select id, owner_discord_id as "ownerId", discord_ids as "discordIds", scope, preference
    from discord_parties where id = ${id} and owner_discord_id = ${ownerId} and created_at > now() - ${TTL}::interval`;
  return (row as unknown as Party | undefined) ?? null;
}

// 기준 바꾸기: 같은 친구 묶음에서 기준만 바꾼다(다른 추천·뽑기도 바뀐 기준을 따른다).
export async function setPartyPreference(id: string, ownerId: string, preference: Preference) {
  const sql = await db();
  await sql`update discord_parties set preference = ${preference} where id = ${id} and owner_discord_id = ${ownerId}`;
}

// 지난번 친구 묶음(하루 안). /게임추천의 친구 선택창에 "지난번 멤버로" 버튼을 붙이는 데 쓴다.
export async function lastParty(ownerId: string): Promise<Party | null> {
  const sql = await db();
  const [row] = await sql`select id, owner_discord_id as "ownerId", discord_ids as "discordIds", scope, preference
    from discord_parties where owner_discord_id = ${ownerId} and created_at > now() - ${TTL}::interval order by created_at desc limit 1`;
  return (row as unknown as Party | undefined) ?? null;
}
