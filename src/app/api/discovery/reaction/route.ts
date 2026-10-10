import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/viewer';
import { parseBody, parseQuery, serverError } from '@/server/http';
import { discoveryReaction, setDiscoveryReaction, DiscoveryRecordMissingError } from '@/server/discovery-reactions';

const cardId = z.string().max(500).regex(/^(?:play:steam|award:\d{4}-\d{2}-\d{2}:(?:owl|jester|oneshot|magnet|talker|replier|laugher)|(?:moment|highlight):https:\/\/discord\.com\/channels\/[^/?#]+\/[^/?#]+\/[^/?#]+)$/).refine(id => {
  if (!id.startsWith('award:')) return true;
  const date = id.split(':')[1];
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
});
const querySchema = z.object({ cardId });
const bodySchema = querySchema.extend({ reacted: z.boolean() }).strict();

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const query = parseQuery(request.nextUrl.searchParams, querySchema);
  if (!query.ok) return query.response;
  try { return Response.json(await discoveryReaction(query.data.cardId, user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return serverError(error); }
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (request.headers.get('origin') !== request.nextUrl.origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  try { return Response.json(await setDiscoveryReaction(body.data.cardId, user.id, body.data.reacted), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) {
    if (error instanceof DiscoveryRecordMissingError) return Response.json({ error: 'Discovery record missing' }, { status: 404 });
    return serverError(error);
  }
}
