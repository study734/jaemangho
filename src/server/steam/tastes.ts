import { z } from 'zod';
import { pool } from '../pool';
import { emptyTaste, tasteTags, type GameTaste } from '../../domain/steam-personal';
import { catalogIds } from './catalog';
import { STEAM_FEATURE_NOTICE } from './consent';

const tags = z.array(z.enum(tasteTags)).max(tasteTags.length).transform(values => [...new Set(values)]);
const games = z.array(z.number().int().positive().refine(id => catalogIds.has(id))).max(catalogIds.size).transform(values => [...new Set(values)]);
// Retired sharing switches are accepted and dropped for older clients.
// Current feature consent controls all use in common recommendations.
export const tasteSchema = z.object({ likes: tags, avoids: tags, likedGames: games, avoidedGames: games,
  groupConsent: z.unknown().optional(),
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

// Only current feature consent grants use in common recommendations. Return profiles only inside the server,
// for selected accounts still owned by the user who saved the profile.
export async function readGroupTastes(steamIds: string[]): Promise<Map<string, GameTaste>> {
  const result = await pool.query<{ steam_id: string; profile: unknown }>(`select m.steam_id, t.profile
    from steam_members m join steam_tastes t on t.user_id=m.owner_id
    join steam_feature_consents c on c.user_id=m.owner_id and c.notice_version=$2 and c.revoked_at is null
    where m.steam_id=any($1)`, [steamIds, STEAM_FEATURE_NOTICE]);
  return new Map(result.rows.map(row => [row.steam_id, tasteSchema.parse(row.profile)]));
}
