import { db } from './db';

// 재순이·사이트를 쓸 수 있는 디스코드 역할(intent/0004). 관리자가 디스코드 /운영 사용역할로 정한다.
// - 정하지 않았으면(행 없음) 서버 멤버 모두 허용. 정하면 그 역할이 있는 멤버만 쓴다.
// - 서버 관리자(소유자·Administrator)는 역할이 없어도 통과한다(관리자가 스스로 잠기지 않게).
// - 디스코드 명령은 Discord가 서명해 보낸 member.roles로, 웹 로그인은 봇 토큰으로 역할을 조회해 확인한다.
//   웹은 로그인할 때만 확인하므로 역할을 뺀 사람의 기존 세션은 만료(최대 7일)까지 남는다. 바로 끊으려면 관리자 화면에서 차단한다.
const DISCORD = 'https://discord.com/api/v10';
const SNOWFLAKE = /^\d{17,20}$/;

export async function memberRole(): Promise<string | null> {
  const sql = await db();
  const [row] = await sql`select role_id as "roleId" from discord_member_role where id = 1`;
  return (row?.roleId as string | undefined) ?? null;
}

export async function setMemberRole(roleId: string | null, setBy: string) {
  const sql = await db();
  if (!roleId) { await sql`delete from discord_member_role where id = 1`; return; }
  await sql`insert into discord_member_role (id, role_id, set_by) values (1, ${roleId}, ${setBy})
    on conflict (id) do update set role_id = excluded.role_id, set_by = excluded.set_by, updated_at = now()`;
}

export const roleAllows = (required: string | null, roles: readonly string[], isAdmin: boolean) =>
  !required || isAdmin || roles.includes(required);

// 서버 멤버의 역할 ID 목록. 토큰이 없거나 조회가 실패하면 null(호출자는 거부한다). 상태 코드만 남기고 토큰은 남기지 않는다.
export async function fetchMemberRoles(discordId: string, guildId: string, token: string | undefined, fetchFn: typeof fetch = fetch): Promise<string[] | null> {
  if (!token) { console.error('discord member role lookup failed: no_bot_token'); return null; }
  try {
    const response = await fetchFn(`${DISCORD}/guilds/${guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (!response.ok) { console.error('discord member role lookup failed:', response.status); return null; }
    const body = await response.json().catch(() => null) as { roles?: unknown } | null;
    if (!Array.isArray(body?.roles)) { console.error('discord member role lookup failed: invalid_response'); return null; }
    return body.roles.filter((id): id is string => typeof id === 'string' && SNOWFLAKE.test(id));
  } catch {
    console.error('discord member role lookup failed: network'); return null;
  }
}

// 웹 로그인 판정(auth.ts의 getUserInfo). 역할을 정하지 않았거나 서버 관리자면 Discord를 조회하지 않는다.
export async function webLoginAllowed(discordId: string, isAdmin: boolean,
  { guildId, token, fetchFn = fetch }: { guildId: string; token: string | undefined; fetchFn?: typeof fetch }): Promise<boolean> {
  const required = await memberRole();
  if (roleAllows(required, [], isAdmin)) return true;
  const roles = await fetchMemberRoles(discordId, guildId, token, fetchFn);
  return !!roles && roleAllows(required, roles, false);
}
