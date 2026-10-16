import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { eraseSteamActivity, getSteamActivitySettings, requestSteamActivity, SteamNoticeUnavailableError, stopSteamActivity } from '@/server/activity/steam-consent';
import { parseBody, serverError } from '@/server/http';
import { requireUser } from '@/server/viewer';
import { after } from 'next/server';
import { runSteamCollection, SteamCollectionBusyError } from '@/server/activity/steam-collection';
import { reportFailure } from '@/server/diagnostics';
import { hasSteamConsent, requireSteamUser } from '@/server/steam/consent';

const accountSchema = z.object({ steamId: z.string().regex(/^\d{17}$/) });
const requestSchema = accountSchema.extend({ noticeVersion: z.string().min(1).max(80) });

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    let settings = await getSteamActivitySettings(user.id);
    const newAccounts = settings.accounts.filter(account => !account.requestedAt);
    if (newAccounts.length && await hasSteamConsent(user.id)) {
      for (const account of newAccounts) await requestSteamActivity(user.id, account.steamId, settings.noticeVersion);
      settings = await getSteamActivitySettings(user.id);
    }
    const due = settings.accounts.filter(account => account.requestedAt && !account.stoppedAt && account.noticeVersion === settings.noticeVersion &&
      (!account.lastSuccessAt || Date.now() - new Date(account.lastSuccessAt).getTime() >= 7 * 86_400_000));
    if (settings.storageCountry && due.length) prepareActivity(due.map(account => account.steamId));
    return Response.json(settings, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (error) { return serverError(error, 'api/steam/activity.GET'); }
}

export async function POST(request: NextRequest) {
  const user = await requireSteamUser();
  if (user instanceof Response) return user;
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const body = await parseBody(request, requestSchema);
  if (!body.ok) return body.response;
  try {
    if (!await requestSteamActivity(user.id, body.data.steamId, body.data.noticeVersion)) {
      return Response.json({ error: 'Steam account not verified' }, { status: 403 });
    }
    prepareActivity([body.data.steamId]);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof SteamNoticeUnavailableError) return Response.json({ error: 'Storage country is not configured' }, { status: 503 });
    return serverError(error, 'api/steam/activity.POST');
  }
}

function prepareActivity(steamIds: string[]) {
  after(async () => {
    try { await runSteamCollection('manual', { steamIds }); }
    catch (error) { if (!(error instanceof SteamCollectionBusyError)) reportFailure('steam.activity.prepare', error); }
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const body = await parseBody(request, accountSchema);
  if (!body.ok) return body.response;
  try {
    return (await stopSteamActivity(user.id, body.data.steamId))
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'No active request' }, { status: 404 });
  } catch (error) { return serverError(error, 'api/steam/activity.PATCH'); }
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const body = await parseBody(request, accountSchema);
  if (!body.ok) return body.response;
  try {
    return (await eraseSteamActivity(user.id, body.data.steamId))
      ? new Response(null, { status: 204 })
      : Response.json({ error: 'Steam account not verified' }, { status: 404 });
  } catch (error) { return serverError(error, 'api/steam/activity.DELETE'); }
}
