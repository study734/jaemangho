import { db } from '../db';

// Discord signs the guild/member identity. Project registration and bans are checked afresh on each command/click.
// Returns the project user id of a registered, unbanned Discord member, or null.
export async function commandUser(discordId: string): Promise<string | null> {
  const sql = await db();
  const rows = await sql`select u.id from account a join "user" u on u.id = a."userId"
    where a."providerId" = 'discord' and a."accountId" = ${discordId} and not coalesce(u.banned, false)`;
  return rows.length === 1 ? rows[0].id as string : null;
}

export interface LinkedPlayer { discordId: string; steamId: string }
export async function linkedPlayers(discordIds: string[]): Promise<LinkedPlayer[]> {
  const sql = await db();
  return await sql`select distinct a."accountId" as "discordId", s.steam_id as "steamId"
    from account a join "user" u on u.id = a."userId" join steam_members s on s.owner_id = u.id
    where a."providerId" = 'discord' and a."accountId" = any(${discordIds}) and not coalesce(u.banned, false)
    order by a."accountId", s.steam_id` as unknown as LinkedPlayer[];
}
