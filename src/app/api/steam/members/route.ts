import type { NextRequest } from 'next/server';
import { parseBody, serverError } from '@/server/http';
import { SteamNotConfiguredError, SteamUpstreamError } from '@/server/steam/client';
import {
  DuplicateSteamMemberError,
  InvalidSteamInputError,
  SteamProfileNotFoundError,
  addMemberSchema,
  addSteamMember,
  listSteamMembers,
  removeSteamMember,
  setOwnerSchema,
  setSteamOwner,
  steamIdSchema,
} from '@/server/steam/roster';
import { requireUser } from '@/server/viewer';

const failure = (e: unknown) => {
  if (e instanceof InvalidSteamInputError) return Response.json({ error: 'Invalid Steam profile' }, { status: 400 });
  if (e instanceof SteamProfileNotFoundError) return Response.json({ error: 'Steam profile not found' }, { status: 404 });
  if (e instanceof DuplicateSteamMemberError) return Response.json({ error: 'Already added' }, { status: 409 });
  if (e instanceof SteamNotConfiguredError) return Response.json({ error: 'Steam is not configured' }, { status: 503 });
  if (e instanceof SteamUpstreamError) return Response.json({ error: 'Steam unavailable' }, { status: 502 });
  return serverError(e);
};

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    return Response.json(await listSteamMembers());
  } catch (e) {
    return failure(e);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseBody(request, addMemberSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await addSteamMember(body.data.input, user, body.data.ownerId));
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseBody(request, setOwnerSchema);
  if (!body.ok) return body.response;
  try {
    return (await setSteamOwner(body.data.steamId, body.data.ownerId, user.id))
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const id = steamIdSchema.safeParse(request.nextUrl.searchParams.get('id'));
  if (!id.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  try {
    return (await removeSteamMember(id.data, user.id))
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'Not found or verified by another user' }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}
