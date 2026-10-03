import { z } from 'zod';
import { db } from '../db';

// 소환사 목록(식별 정보만). 티어/전적은 Riot에서 매번 받아오므로 저장하지 않는다.
export const rosterEntrySchema = z.object({
  id: z.string().regex(/^[\w-]{1,32}$/),
  gameName: z.string().trim().min(1).max(32),
  tagLine: z.string().trim().min(1).max(16),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export class DuplicateSummonerError extends Error {
  constructor() {
    super('Duplicate Riot ID');
  }
}

// 같은 Riot ID(대소문자 무시)는 DB의 유니크 인덱스가 막는다
const asDuplicate = (e: unknown) => (e as { code?: string }).code === '23505' ? new DuplicateSummonerError() : e;

export async function listRoster(): Promise<RosterEntry[]> {
  const sql = await db();
  return (await sql`select id, game_name as "gameName", tag_line as "tagLine" from members order by created_at desc`) as RosterEntry[];
}

export async function addToRoster(entry: RosterEntry, creator: { id: string; name: string }) {
  const sql = await db();
  try {
    await sql`insert into members (id, game_name, tag_line, created_by, created_by_name)
      values (${entry.id}, ${entry.gameName}, ${entry.tagLine}, ${creator.id}, ${creator.name})`;
  } catch (e) {
    throw asDuplicate(e);
  }
}

export async function updateRoster(entry: RosterEntry) {
  const sql = await db();
  try {
    await sql`update members set game_name = ${entry.gameName}, tag_line = ${entry.tagLine} where id = ${entry.id}`;
  } catch (e) {
    throw asDuplicate(e);
  }
}

export async function removeFromRoster(id: string) {
  const sql = await db();
  await sql`delete from members where id = ${id}`;
}
