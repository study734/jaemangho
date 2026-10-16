import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/viewer';
import { parseBody, serverError } from '@/server/http';
import { addNotice, listNotices, noticeSchema } from '@/server/game-notices';

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try { return Response.json(await listNotices(), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return serverError(error, 'api/notices.GET'); }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (request.headers.get('origin') !== request.nextUrl.origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const body = await parseBody(request, noticeSchema);
  if (!body.ok) return body.response;
  try { return Response.json({ id: await addNotice(user.id, body.data) }, { status: 201 }); }
  catch (error) { return serverError(error, 'api/notices.POST'); }
}
