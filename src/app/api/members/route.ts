import type { NextRequest } from 'next/server';
import { parseBody, serverError } from '@/server/http';
import { DuplicateSummonerError, addToRoster, listRoster, removeFromRoster, rosterEntrySchema, updateRoster } from '@/server/lol/roster';
import { requireUser } from '@/server/viewer';
import { z } from 'zod';

const failure = (e: unknown) =>
  e instanceof DuplicateSummonerError ? Response.json({ error: e.message }, { status: 409 }) : serverError(e);

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    return Response.json(await listRoster());
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseBody(request, rosterEntrySchema);
  if (!body.ok) return body.response;
  try {
    await addToRoster(body.data, user);
    return Response.json(body.data);
  } catch (e) {
    return failure(e);
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseBody(request, rosterEntrySchema);
  if (!body.ok) return body.response;
  try {
    await updateRoster(body.data);
    return Response.json(body.data);
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const id = z.string().regex(/^[\w-]{1,32}$/).safeParse(request.nextUrl.searchParams.get('id'));
  if (!id.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  try {
    await removeFromRoster(id.data);
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
