import { db } from '../db';

// Discord signs the guild/member identity. Project registration and bans are checked afresh on each command/click.
// Returns the project user id of a registered, unbanned Discord member, or null.
export async function commandUser(discordId: string): Promise<string | null> {
  const sql = await db();
  const rows = await sql`select u.id from account a join "user" u on u.id = a."userId"
    where a."providerId" = 'discord' and a."accountId" = ${discordId} and not coalesce(u.banned, false)`;
  return rows.length === 1 ? rows[0].id as string : null;
}

// 디스코드 명령의 요청자 확인(intent/0004). 이 서버의 멤버인지는 Discord 서명과 서버 ID로 이미 확인했다.
// 사이트 계정이 없으면 손님(userId null)으로 대부분의 기능을 쓰고, 사이트에서 차단된 계정은 모두 막는다.
export type CommandAccess = { userId: string | null } | 'banned';
export async function commandAccess(discordId: string): Promise<CommandAccess> {
  const sql = await db();
  const rows = await sql`select u.id, coalesce(u.banned, false) as banned from account a join "user" u on u.id = a."userId"
    where a."providerId" = 'discord' and a."accountId" = ${discordId}`;
  if (rows.some(row => row.banned)) return 'banned';
  return { userId: rows.length === 1 ? rows[0].id as string : null };
}

export interface LinkedPlayer { discordId: string; steamId: string }
export async function linkedPlayers(discordIds: string[]): Promise<LinkedPlayer[]> {
  const sql = await db();
  return await sql`select distinct a."accountId" as "discordId", s.steam_id as "steamId"
    from account a join "user" u on u.id = a."userId" join steam_members s on s.owner_id = u.id
    where a."providerId" = 'discord' and a."accountId" = any(${discordIds}) and not coalesce(u.banned, false)
    order by a."accountId", s.steam_id` as unknown as LinkedPlayer[];
}

// 관리자 명령: Discord가 서명해 보낸 현재 권한(member.permissions)에 Administrator 비트가 있고,
// 사이트의 기존 관리자 판정(로그인할 때 서버 소유자·Administrator로 갱신되는 role)도 admin이어야 한다.
// 명령이 메뉴에 보이는지(default_member_permissions)는 서버 설정으로 바뀔 수 있으므로 실행 조건으로 쓰지 않는다.
const ADMINISTRATOR = 1n << 3n;
export const hasAdministrator = (permissions: string | undefined) =>
  !!permissions && /^\d{1,20}$/.test(permissions) && (BigInt(permissions) & ADMINISTRATOR) === ADMINISTRATOR;

export async function adminUser(discordId: string, permissions: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!hasAdministrator(permissions)) return null;
  const sql = await db();
  const rows = await sql`select u.id, u.name from account a join "user" u on u.id = a."userId"
    where a."providerId" = 'discord' and a."accountId" = ${discordId} and u.role = 'admin' and not coalesce(u.banned, false)`;
  return rows.length === 1 ? { id: rows[0].id as string, name: rows[0].name as string } : null;
}
