const DISCORD = 'https://discord.com/api';

// 디스코드 서버 소유자이거나 Administrator(0x8) 권한이 있으면 관리자.
// guild는 /users/@me/guilds 항목({ owner, permissions }).
const ADMINISTRATOR = 8n;
export const isGuildAdmin = (guild: { owner?: boolean; permissions?: string }) =>
  guild.owner === true || (BigInt(guild.permissions ?? 0) & ADMINISTRATOR) !== 0n;

export interface GuildMember {
  id: string;
  name: string;
  username: string;
  image: string | null;
  isAdmin: boolean;
  // 디스코드가 준 원본 프로필 (/users/@me 응답)
  profile: DiscordUser;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}
interface DiscordGuild {
  id: string;
  owner?: boolean;
  permissions?: string;
}

// 로그인한 사용자가 지정한 디스코드 서버의 멤버인지 확인하고 프로필과 관리자 여부를 돌려준다.
// 멤버가 아니거나 디스코드 API 호출이 실패하면 null (두 경우 모두 로그인을 거부한다).
export async function fetchGuildMember(
  accessToken: string,
  guildId: string,
  fetchFn: typeof fetch = fetch
): Promise<GuildMember | null> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [meRes, guildsRes] = await Promise.all([
    fetchFn(`${DISCORD}/users/@me`, { headers }),
    fetchFn(`${DISCORD}/users/@me/guilds`, { headers }),
  ]);
  if (!meRes.ok || !guildsRes.ok) {
    console.error('discord lookup failed', meRes.status, guildsRes.status);
    return null;
  }

  const me = (await meRes.json()) as DiscordUser;
  const guild = ((await guildsRes.json()) as DiscordGuild[]).find((g) => g.id === guildId);
  if (!guild) return null;

  return {
    id: me.id,
    name: me.global_name ?? me.username,
    username: me.username,
    image: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null,
    isAdmin: isGuildAdmin(guild),
    profile: me,
  };
}
