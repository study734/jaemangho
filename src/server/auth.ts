import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins';
import type { DiscordProfile } from 'better-auth/social-providers';
import { fetchGuildMember } from './discord';
import { pool } from './pool';

// 로그인 중인 사용자의 권한. getUserInfo(디스코드 토큰을 가진 유일한 지점)에서 계산해 두었다가
// 세션이 만들어진 직후 훅에서 user 행에 반영한다. 한 번의 콜백 요청 안에서만 쓰이는 값이라 금방 비운다.
const pending = new Map<string, { role: 'admin' | 'user'; username: string; at: number }>();
const PENDING_TTL_MS = 5 * 60 * 1000;

// 빌드는 비밀키 없이도 되어야 한다(CI 등). 빌드 단계에서만 자리표시자를 쓰고, 실행 중에 SESSION_SECRET이 없으면 라이브러리가 오류를 낸다.
const secret =
  process.env.SESSION_SECRET ??
  (process.env.NEXT_PHASE === 'phase-production-build' ? 'build-phase-placeholder-secret-not-used-at-runtime' : undefined);

export const auth = betterAuth({
  database: pool,
  secret,
  appName: '재망호',

  // 세션은 DB에 저장된다(차단하면 바로 끊을 수 있음). 쿠키 캐시는 끈다: 차단이 즉시 반영돼야 한다.
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { cookiePrefix: 'jmh' },
  onAPIError: { errorURL: '/login' },

  user: {
    additionalFields: {
      username: { type: 'string', required: false, input: false },
      loginCount: { type: 'number', required: false, defaultValue: 0, input: false },
      lastLoginAt: { type: 'date', required: false, input: false },
    },
  },

  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      // 기본 스코프(identify+email)는 쓰지 않는다: 이메일이 없는 계정이 있고, 서버 멤버 확인에는 guilds가 필요하다.
      disableDefaultScope: true,
      scope: ['identify', 'guilds'],

      // 크루 디스코드 서버 멤버만 통과시킨다. null을 돌려주면 로그인이 거부된다(unable_to_get_user_info).
      getUserInfo: async (token) => {
        if (!token.accessToken) return null;
        const member = await fetchGuildMember(token.accessToken, process.env.DISCORD_GUILD_ID ?? '');
        if (!member) return null;

        // 차단된 사용자도 여기서 거부한다. 관리자 플러그인의 차단 검사는 요청 컨텍스트가 있을 때만 동작하므로
        // 그것에만 기대지 않고, 디스코드 계정으로 연결된 사용자의 banned를 직접 확인한다.
        const ban = await pool.query(
          `select u.banned from account a join "user" u on u.id = a."userId"
           where a."accountId" = $1 and a."providerId" = 'discord'`,
          [member.id]
        );
        if (ban.rows[0]?.banned) return null;

        for (const [key, value] of pending) if (Date.now() - value.at > PENDING_TTL_MS) pending.delete(key);
        pending.set(member.id, { role: member.isAdmin ? 'admin' : 'user', username: member.username, at: Date.now() });

        return {
          // 사용자 식별(account.accountId)은 아래 data의 id(디스코드 ID)에서 정해진다
          user: {
            name: member.name,
            // 라이브러리가 이메일을 요구하므로 디스코드 ID로 만든 대체 주소를 쓴다 (실제 이메일은 받지 않는다)
            email: `${member.id}@discord.invalid`,
            emailVerified: false,
            image: member.image ?? undefined,
          },
          data: member.profile as unknown as DiscordProfile,
        };
      },
    },
  },

  plugins: [admin(), nextCookies()],

  databaseHooks: {
    session: {
      create: {
        // 로그인할 때마다 디스코드 서버 권한(관리자 여부)과 접속 기록을 반영한다. 차단된 사용자는 admin 플러그인이 먼저 막는다.
        after: async (session) => {
          const account = await pool.query(
            `select "accountId" from account where "userId" = $1 and "providerId" = 'discord'`,
            [session.userId]
          );
          const discordId = account.rows[0]?.accountId as string | undefined;
          const info = discordId ? pending.get(discordId) : undefined;
          if (discordId) pending.delete(discordId);
          if (!info) return;

          await pool.query(
            `update "user" set role = $2, username = $3, "loginCount" = coalesce("loginCount", 0) + 1, "lastLoginAt" = now()
             where id = $1`,
            [session.userId, info.role, info.username]
          );
        },
      },
    },
  },
});
