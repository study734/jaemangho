import type { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { requireUser } from '@/server/viewer';

interface MemberInput {
  id: string;
  gameName: string;
  tagLine: string;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function readMember(request: NextRequest): Promise<MemberInput | null> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const m = { id: clean(body?.id), gameName: clean(body?.gameName), tagLine: clean(body?.tagLine) };
  const valid = /^[\w-]{1,32}$/.test(m.id) && m.gameName && m.gameName.length <= 32 && m.tagLine && m.tagLine.length <= 16;
  return valid ? m : null;
}

const serverError = (e: unknown) => {
  if ((e as { code?: string }).code === '23505') return Response.json({ error: 'Duplicate Riot ID' }, { status: 409 });
  console.error(e);
  return Response.json({ error: 'Server error' }, { status: 500 });
};

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const sql = await db();
    const rows = await sql`select id, game_name as "gameName", tag_line as "tagLine"
      from members order by created_at desc`;
    return Response.json(rows);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const m = await readMember(request);
  if (!m) return Response.json({ error: 'Invalid member' }, { status: 400 });
  try {
    const sql = await db();
    await sql`insert into members (id, game_name, tag_line, created_by, created_by_name)
      values (${m.id}, ${m.gameName}, ${m.tagLine}, ${user.id}, ${user.name})`;
    return Response.json(m);
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const m = await readMember(request);
  if (!m) return Response.json({ error: 'Invalid member' }, { status: 400 });
  try {
    const sql = await db();
    await sql`update members set game_name = ${m.gameName}, tag_line = ${m.tagLine} where id = ${m.id}`;
    return Response.json(m);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const sql = await db();
    await sql`delete from members where id = ${clean(request.nextUrl.searchParams.get('id'))}`;
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}
