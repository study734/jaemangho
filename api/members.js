import { requireUser } from './_lib/guard.js';
import { db } from './_lib/db.js';

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const valid = ({ id, gameName, tagLine }) =>
  /^[\w-]{1,32}$/.test(id) && gameName && gameName.length <= 32 && tagLine && tagLine.length <= 16;

export default async function handler(req, res) {
  const session = await requireUser(req, res);
  if (!session) return;

  try {
    const sql = await db();

    if (req.method === 'GET') {
      const rows = await sql`select id, game_name as "gameName", tag_line as "tagLine"
        from members order by created_at desc`;
      return res.status(200).json(rows);
    }

    if (req.method === 'DELETE') {
      await sql`delete from members where id = ${clean(req.query.id)}`;
      return res.status(204).end();
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const m = { id: clean(req.body?.id), gameName: clean(req.body?.gameName), tagLine: clean(req.body?.tagLine) };
      if (!valid(m)) return res.status(400).json({ error: 'Invalid member' });
      if (req.method === 'POST') {
        await sql`insert into members (id, game_name, tag_line, created_by)
          values (${m.id}, ${m.gameName}, ${m.tagLine}, ${session.id})`;
      } else {
        await sql`update members set game_name = ${m.gameName}, tag_line = ${m.tagLine} where id = ${m.id}`;
      }
      return res.status(200).json(m);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Duplicate Riot ID' });
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
