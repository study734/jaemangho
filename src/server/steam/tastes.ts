import { z } from 'zod';
import { pool } from '../pool';
import { emptyTaste, tasteTags, type GameTaste } from '../../domain/steam-personal';
import { catalogIds } from './catalog';
import { listSteamMembers, steamIdSchema } from './roster';

const tags = z.array(z.enum(tasteTags)).max(tasteTags.length).transform(values => [...new Set(values)]);
const games = z.array(z.number().int().positive().refine(id => catalogIds.has(id))).max(10).transform(values => [...new Set(values)]);
export const tasteSchema = z.object({ likes: tags, avoids: tags, likedGames: games, avoidedGames: games,
  share: z.boolean(), together: z.array(z.object({ appId: z.number().int().refine(id => catalogIds.has(id)),
    steamIds: z.array(steamIdSchema).min(2).max(20).transform(ids => [...new Set(ids)]).refine(ids => ids.length >= 2),
  })).max(10),
}).strict().refine(value => !value.likes.some(tag => value.avoids.includes(tag)) && !value.likedGames.some(id => value.avoidedGames.includes(id)), '좋아함과 제외에 같은 항목을 넣을 수 없어요.');

export class TasteInputError extends Error {}
export async function readTaste(userId: string): Promise<GameTaste> {
  const result = await pool.query('select profile from steam_tastes where user_id=$1', [userId]);
  return result.rows[0] ? tasteSchema.parse(result.rows[0].profile) : emptyTaste();
}
export async function sharedTastes(userIds: string[]): Promise<Map<string, GameTaste>> {
  if (!userIds.length) return new Map();
  const result = await pool.query(`select user_id, profile from steam_tastes where user_id=any($1) and profile->>'share'='true'`, [userIds]);
  return new Map(result.rows.map(row => [row.user_id, tasteSchema.parse(row.profile)]));
}
export async function saveTaste(userId: string, profile: GameTaste) {
  const taste = tasteSchema.parse(profile);
  const members = await listSteamMembers();
  // A claim is explicitly attributed to its author; never record a game solely
  // on behalf of other members. Registration ownership is not Steam verification.
  for (const record of taste.together) {
    if (!record.steamIds.every(id => members.some(member => member.steamId === id)) ||
      !record.steamIds.some(id => members.some(member => member.steamId === id && member.ownerId === userId)))
      throw new TasteInputError('함께한 기록에는 내 연결 계정과 등록된 친구를 포함해 주세요.');
  }
  const result = await pool.query(`insert into steam_tastes(user_id, profile) select id, $2 from "user" where id=$1
    on conflict(user_id) do update set profile=excluded.profile, updated_at=now() returning user_id`, [userId, JSON.stringify(taste)]);
  if (!result.rowCount) throw new TasteInputError('실제 로그인 계정에서 취향을 저장해 주세요.');
}
export async function deleteTaste(userId: string) { await pool.query('delete from steam_tastes where user_id=$1', [userId]); }
