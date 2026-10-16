import { after } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/viewer';
import { parseBounded, serverError } from '@/server/http';
import { acceptSteamConsent, hasSteamConsent, revokeSteamConsent, STEAM_FEATURE_NOTICE } from '@/server/steam/consent';
import { STEAM_STORAGE_COUNTRY } from '@/server/activity/steam-policy';
import { runSteamCollection, SteamCollectionBusyError } from '@/server/activity/steam-collection';
import { reportFailure } from '@/server/diagnostics';

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try { return Response.json({ accepted: await hasSteamConsent(user.id), noticeVersion: STEAM_FEATURE_NOTICE,
    storageCountry: STEAM_STORAGE_COUNTRY }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return serverError(error, 'steam.consent.GET'); }
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const input = await parseBounded(request, z.object({ accepted: z.literal(true), noticeVersion: z.literal(STEAM_FEATURE_NOTICE) }).strict(), 1024);
  if (!input.ok) return input.response;
  try {
    const ids = await acceptSteamConsent(user.id, input.data.noticeVersion);
    if (ids.length) after(async () => {
      try { await runSteamCollection('manual', { steamIds: ids }); }
      catch (error) { if (!(error instanceof SteamCollectionBusyError)) reportFailure('steam.consent.prepare', error); }
    });
    return Response.json({ accepted: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return serverError(error, 'steam.consent.POST'); }
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const input = await parseBounded(request, z.object({}).strict(), 100);
  if (!input.ok) return input.response;
  try { await revokeSteamConsent(user.id); return Response.json({ accepted: false }); }
  catch (error) { return serverError(error, 'steam.consent.DELETE'); }
}
