import { z } from 'zod';
import { requireSteamUser } from '@/server/steam/consent';
import { parseBounded, serverError } from '@/server/http';
import { readTaste, saveTaste, deleteTaste, tasteSchema, TasteInputError } from '@/server/steam/tastes';
import { listSteamMembers } from '@/server/steam/roster';
import { recommendationCatalog } from '@/server/steam/catalog';
import { tasteTags, tasteLabels } from '@/domain/steam-personal';

export async function GET() {
  const user = await requireSteamUser();
  if (user instanceof Response) return user;
  try {
    const [taste, members] = await Promise.all([readTaste(user.id), listSteamMembers()]);
    return Response.json({ taste, members: members.map(member => ({ steamId: member.steamId, name: member.name, own: member.ownerId === user.id })), catalog: recommendationCatalog, tags: tasteTags.map(id => ({ id, label: tasteLabels[id] })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return serverError(error, 'steam.taste.GET'); }
}
export async function PUT(request: Request) {
  const user = await requireSteamUser();
  if (user instanceof Response) return user;
  const input = await parseBounded(request, tasteSchema, 16_384);
  if (!input.ok) return input.response;
  try {
    await saveTaste(user.id, input.data);
    return Response.json({ taste: input.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof TasteInputError) return Response.json({ error: error.message }, { status: 400 });
    return serverError(error, 'steam.taste.PUT');
  }
}
export async function DELETE(request: Request) {
  const user = await requireSteamUser();
  if (user instanceof Response) return user;
  const input = await parseBounded(request, z.object({}).strict(), 100);
  if (!input.ok) return input.response;
  try { await deleteTaste(user.id); return Response.json({ ok: true }); }
  catch (error) { return serverError(error, 'steam.taste.DELETE'); }
}
