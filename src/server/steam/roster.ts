import { z } from 'zod';
import { db } from '../db';
import { SteamUpstreamError, getProfile, parseSteamInput, resolveSteamId } from './client';

export const steamIdSchema = z.string().regex(/^\d{17}$/);
export const addMemberSchema = z.object({ input: z.string().trim().min(2).max(200) });

export interface SteamMember {
  steamId: string;
  name: string;
  avatar: string | null;
}

export class InvalidSteamInputError extends Error {}
export class SteamProfileNotFoundError extends Error {}
export class DuplicateSteamMemberError extends Error {}

export async function listSteamMembers(): Promise<SteamMember[]> {
  const sql = await db();
  return (await sql`select steam_id as "steamId", persona_name as name, avatar from steam_members order by created_at desc`) as unknown as SteamMember[];
}

export async function addSteamMember(rawInput: string, creator: { id: string; name: string }): Promise<SteamMember> {
  const input = parseSteamInput(rawInput);
  if (!input) throw new InvalidSteamInputError();
  const steamId = await resolveSteamId(input);
  const profile = steamId ? await getProfile(steamId) : null;
  if (!profile) throw new SteamProfileNotFoundError();
  const sql = await db();
  try {
    await sql`insert into steam_members (steam_id, persona_name, avatar, created_by, created_by_name)
      values (${profile.steamId}, ${profile.name}, ${profile.avatar}, ${creator.id}, ${creator.name})`;
  } catch (e) {
    throw (e as { code?: string }).code === '23505' ? new DuplicateSteamMemberError() : e;
  }
  return { steamId: profile.steamId, name: profile.name, avatar: profile.avatar };
}

export async function removeSteamMember(steamId: string) {
  const sql = await db();
  await sql`delete from steam_members where steam_id = ${steamId}`;
}

// 등록된 사람만 조회한다 (우리 Steam 키로 아무 계정이나 조회하는 프록시가 되지 않게)
export async function registeredIds(ids: string[]): Promise<string[]> {
  const sql = await db();
  const rows = await sql`select steam_id as "steamId" from steam_members where steam_id = any(${ids})`;
  return rows.map((r) => r.steamId as string);
}

export { SteamUpstreamError };
