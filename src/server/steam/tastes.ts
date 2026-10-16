import { z } from 'zod';
import { pool } from '../pool';
import { emptyTaste, tasteTags, type GameTaste } from '../../domain/steam-personal';
import { catalogIds } from './catalog';

const tags = z.array(z.enum(tasteTags)).max(tasteTags.length).transform(values => [...new Set(values)]);
const games = z.array(z.number().int().positive().refine(id => catalogIds.has(id))).max(10).transform(values => [...new Set(values)]);
// share/together were removed with the group recommendation; stored profiles and old clients may still
// carry them, so they are accepted and dropped. Any other unknown key is still rejected.
export const tasteSchema = z.object({ likes: tags, avoids: tags, likedGames: games, avoidedGames: games,
  share: z.unknown().optional(), together: z.unknown().optional(),
}).strict().refine(value => !value.likes.some(tag => value.avoids.includes(tag)) && !value.likedGames.some(id => value.avoidedGames.includes(id)), '좋아함과 제외에 같은 항목을 넣을 수 없어요.')
  .transform(({ likes, avoids, likedGames, avoidedGames }) => ({ likes, avoids, likedGames, avoidedGames }));

export class TasteInputError extends Error {}
export async function readTaste(userId: string): Promise<GameTaste> {
  const result = await pool.query('select profile from steam_tastes where user_id=$1', [userId]);
  return result.rows[0] ? tasteSchema.parse(result.rows[0].profile) : emptyTaste();
}
export async function saveTaste(userId: string, profile: GameTaste) {
  const taste = tasteSchema.parse(profile);
  const result = await pool.query(`insert into steam_tastes(user_id, profile) select id, $2 from "user" where id=$1
    on conflict(user_id) do update set profile=excluded.profile, updated_at=now() returning user_id`, [userId, JSON.stringify(taste)]);
  if (!result.rowCount) throw new TasteInputError('실제 로그인 계정에서 취향을 저장해 주세요.');
}
export async function deleteTaste(userId: string) { await pool.query('delete from steam_tastes where user_id=$1', [userId]); }
