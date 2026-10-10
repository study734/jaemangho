import { z } from 'zod';
import { db } from '../db';
import { SteamUpstreamError, getProfile, parseSteamInput, resolveSteamId } from './client';

export const steamIdSchema = z.string().regex(/^\d{17}$/);
const ownerIdSchema = z.string().regex(/^[\w-]{1,64}$/).nullable();
// ownerId: 안 보내면 등록자, null이면 주인 없음
export const addMemberSchema = z.object({ input: z.string().trim().min(2).max(200), ownerId: ownerIdSchema.optional() });
export const setOwnerSchema = z.object({ steamId: steamIdSchema, ownerId: ownerIdSchema });

export interface SteamMember {
  steamId: string;
  name: string;
  avatar: string | null;
  ownerId: string | null;
}

export class InvalidSteamInputError extends Error {}
export class SteamProfileNotFoundError extends Error {}
export class DuplicateSteamMemberError extends Error {}

export async function listSteamMembers(): Promise<SteamMember[]> {
  const sql = await db();
  return (await sql`select steam_id as "steamId", persona_name as name, avatar, owner_id as "ownerId" from steam_members order by created_at desc`) as unknown as SteamMember[];
}

export async function addSteamMember(rawInput: string, creator: { id: string; name: string }, ownerId?: string | null): Promise<SteamMember> {
  const input = parseSteamInput(rawInput);
  if (!input) throw new InvalidSteamInputError();
  const steamId = await resolveSteamId(input);
  const profile = steamId ? await getProfile(steamId) : null;
  if (!profile) throw new SteamProfileNotFoundError();
  const sql = await db();
  const owner = ownerId === undefined ? creator.id : ownerId;
  try {
    // 주인은 실제 사용자일 때만 저장한다(개발용 로그인처럼 user 테이블에 없는 id는 주인 없음)
    await sql`insert into steam_members (steam_id, persona_name, avatar, created_by, created_by_name, owner_id)
      values (${profile.steamId}, ${profile.name}, ${profile.avatar}, ${creator.id}, ${creator.name}, (select id from "user" where id = ${owner}))`;
  } catch (e) {
    throw (e as { code?: string }).code === '23505' ? new DuplicateSteamMemberError() : e;
  }
  const [row] = await sql`select owner_id as "ownerId" from steam_members where steam_id = ${profile.steamId}`;
  return { steamId: profile.steamId, name: profile.name, avatar: profile.avatar, ownerId: (row?.ownerId as string | null) ?? null };
}

export async function setSteamOwner(steamId: string, ownerId: string | null, actorId?: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`update steam_members set owner_id = (select id from "user" where id = ${ownerId})
    where steam_id = ${steamId} and not exists (
      select 1 from steam_verified_accounts v where v.steam_id = ${steamId}
        and (v.user_id is distinct from ${actorId ?? null} or v.user_id is distinct from ${ownerId})
    ) returning steam_id`;
  return rows.length > 0;
}

export async function removeSteamMember(steamId: string, actorId?: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`delete from steam_members where steam_id = ${steamId}
    and not exists (select 1 from steam_verified_accounts v where v.steam_id = ${steamId} and v.user_id is distinct from ${actorId ?? null})
    returning steam_id`;
  return rows.length > 0;
}

// 등록된 사람만 조회한다 (우리 Steam 키로 아무 계정이나 조회하는 프록시가 되지 않게)
export async function registeredIds(ids: string[]): Promise<string[]> {
  const sql = await db();
  const rows = await sql`select steam_id as "steamId" from steam_members where steam_id = any(${ids})`;
  return rows.map((r) => r.steamId as string);
}

export { SteamUpstreamError };
