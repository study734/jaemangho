import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { ConnectionHandler } from '../discord-connections';

export interface RiotAccount {
  gameName: string;
  tagLine: string;
}

// 공식 문서의 연결 서비스 목록에는 Riot이 없다. 아래 종류 이름 중 하나로 오고 이름이 "게임이름#태그"로 읽힐 때만 쓴다.
const RIOT_ID = /^(.{1,32})#([A-Za-z0-9]{1,16})$/;
export function parseRiotId(name: string): RiotAccount | null {
  const m = RIOT_ID.exec(name.trim());
  return m ? { gameName: m[1].trim(), tagLine: m[2] } : null;
}

// 연결된 롤 계정을 그 사용자의 멤버 계정으로 묶는다. 같은 Riot ID(대소문자 무시)가 이미 있으면
// 주인이 비어 있을 때만 주인으로 지정한다. 없으면 새로 등록한다(전적은 롤 화면이 Riot에서 받아 채운다).
export async function linkRiotAccounts(userId: string, accounts: RiotAccount[]) {
  const sql = await db();
  for (const a of accounts) {
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    await sql`insert into members (id, game_name, tag_line, created_by, created_by_name, owner_id)
      values (${id}, ${a.gameName}, ${a.tagLine}, ${userId}, (select name from "user" where id = ${userId}), ${userId})
      on conflict (lower(game_name), lower(tag_line)) do update set owner_id = excluded.owner_id where members.owner_id is null`;
  }
}

export const riotConnection: ConnectionHandler = {
  name: 'riot',
  types: ['riotgames', 'leagueoflegends'],
  async link(userId, connections) {
    const accounts = connections.flatMap((c) => parseRiotId(c.name) ?? []);
    if (accounts.length < connections.length) console.warn(`discord riot connection names not in Name#TAG format: ${connections.length - accounts.length}`);
    await linkRiotAccounts(userId, accounts);
  },
};
