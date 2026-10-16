import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/viewer';
import { serverError } from '@/server/http';
import { deleteNotice } from '@/server/game-notices';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (request.headers.get('origin') !== request.nextUrl.origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: 'Invalid id' }, { status: 400 });
  try { return await deleteNotice(id.data, user.id, user.isAdmin) ? new Response(null, { status: 204 }) : Response.json({ error: 'Not found' }, { status: 404 }); }
  catch (error) { return serverError(error, 'api/notices.DELETE'); }
}
