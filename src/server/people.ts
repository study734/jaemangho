import { db } from './db';

export interface PersonSummary {
  id: string;
  name: string;
  image: string | null;
  lastLogin: string;
  lolCount: number;
  steamCount: number;
}
export interface LolAccount {
  id: string;
  gameName: string;
  tagLine: string;
}
export interface SteamAccount {
  steamId: string;
  name: string;
  avatar: string | null;
}
export interface Person extends Omit<PersonSummary, 'lolCount' | 'steamCount'> {
  lol: LolAccount[];
  steam: SteamAccount[];
}

const iso = (v: unknown) => new Date(v as string | Date).toISOString();

// 멤버 = 디스코드로 로그인한 사용자(차단된 사용자 제외). 롤·Steam 계정은 owner_id로 연결된다.
export async function listPeople(): Promise<PersonSummary[]> {
  const sql = await db();
  const rows = await sql`select u.id, u.name, u.image, coalesce(u."lastLoginAt", u."createdAt") as "lastLogin",
      (select count(*) from members m where m.owner_id = u.id)::int as "lolCount",
      (select count(*) from steam_members s where s.owner_id = u.id)::int as "steamCount"
    from "user" u where not coalesce(u.banned, false) order by u.name`;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    image: (r.image as string | null) ?? null,
    lastLogin: iso(r.lastLogin),
    lolCount: r.lolCount as number,
    steamCount: r.steamCount as number,
  }));
}

export async function getPerson(id: string): Promise<Person | null> {
  const sql = await db();
  const [user] = await sql`select id, name, image, coalesce("lastLoginAt", "createdAt") as "lastLogin" from "user"
    where id = ${id} and not coalesce(banned, false)`;
  if (!user) return null;
  const [lol, steam] = await Promise.all([
    sql`select id, game_name as "gameName", tag_line as "tagLine" from members where owner_id = ${id} order by created_at`,
    sql`select steam_id as "steamId", persona_name as name, avatar from steam_members where owner_id = ${id} order by created_at`,
  ]);
  return {
    id: user.id as string,
    name: user.name as string,
    image: (user.image as string | null) ?? null,
    lastLogin: iso(user.lastLogin),
    lol: lol as unknown as LolAccount[],
    steam: steam as unknown as SteamAccount[],
  };
}

// 주인이 없는 계정. 프로필 화면에서 "이 사람 것으로" 연결할 수 있다.
export async function listUnowned(): Promise<{ lol: LolAccount[]; steam: SteamAccount[] }> {
  const sql = await db();
  const [lol, steam] = await Promise.all([
    sql`select id, game_name as "gameName", tag_line as "tagLine" from members where owner_id is null order by created_at`,
    sql`select steam_id as "steamId", persona_name as name, avatar from steam_members where owner_id is null order by created_at`,
  ]);
  return { lol: lol as unknown as LolAccount[], steam: steam as unknown as SteamAccount[] };
}
