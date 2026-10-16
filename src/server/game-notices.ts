import { z } from 'zod';
import type { Notice } from '@/lib/game-notice';
import { db } from './db';

const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().datetime({ offset: true });

// kind별 필수값(코드는 code, 일정은 startsAt)은 DB 제약과 같은 규칙이다.
export const noticeSchema = z.object({
  kind: z.enum(['event', 'code']),
  game: text(40),
  title: text(100),
  code: text(80).optional(),
  startsAt: date.optional(),
  endsAt: date.optional(),
}).strict().refine(n => n.kind !== 'code' || n.code, { message: 'code required' })
  .refine(n => n.kind !== 'event' || n.startsAt, { message: 'startsAt required' })
  .refine(n => !n.startsAt || !n.endsAt || Date.parse(n.endsAt) >= Date.parse(n.startsAt), { message: 'endsAt before startsAt' });
export type { Notice };
export type NewNotice = z.infer<typeof noticeSchema>;


export async function addNotice(userId: string, n: NewNotice) {
  const sql = await db();
  const [row] = await sql`insert into game_notices (user_id, kind, game, title, code, starts_at, ends_at)
    values (${userId}, ${n.kind}, ${n.game}, ${n.title}, ${n.kind === 'code' ? n.code : null}, ${n.startsAt ?? null}, ${n.endsAt ?? null}) returning id`;
  return String(row.id);
}

// 만료 기준: ends_at, 없으면 일정은 시작 1일 뒤. 둘 다 없는 코드는 지울 때까지 남는다.
export async function listNotices(): Promise<Notice[]> {
  const sql = await db();
  const rows = await sql`select n.id, n.kind, n.game, n.title, n.code, n.starts_at, n.ends_at, n.user_id, u.name as user_name
    from game_notices n join "user" u on u.id = n.user_id
    where coalesce(n.ends_at, n.starts_at + interval '1 day', 'infinity'::timestamptz) > now()
    order by n.kind = 'code', n.starts_at nulls last, n.created_at desc limit 200`;
  const iso = (v: unknown) => v ? new Date(v as string).toISOString() : null;
  return rows.map(r => ({ id: String(r.id), kind: r.kind as Notice['kind'], game: String(r.game), title: String(r.title),
    code: r.code ? String(r.code) : null, startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), userId: String(r.user_id), userName: String(r.user_name) }));
}

// 작성자 본인이나 관리자만 지운다. 지운 행이 없으면 false.
export async function deleteNotice(id: string, userId: string, isAdmin: boolean) {
  const sql = await db();
  const rows = await sql`delete from game_notices where id = ${id}::uuid and (user_id = ${userId} or ${isAdmin}) returning id`;
  return rows.length > 0;
}
