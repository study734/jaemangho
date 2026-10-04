import { createHash, timingSafeEqual } from 'node:crypto';

// 크론 호출 인증. 길이가 달라도 같은 시간에 비교하도록 해시해서 비교한다.
const sha = (s: string) => createHash('sha256').update(s).digest();

export interface CronConfig {
  secret: string;
  token: string;
  guildId: string;
}

// 설정이 하나라도 없으면 'unconfigured'(누구도 호출할 수 없다), 인증이 틀리면 'unauthorized'.
export type CronAuth = { status: 'ok'; config: CronConfig } | { status: 'unconfigured' } | { status: 'unauthorized' };

export function authorizeCron(authorization: string | null, env: Record<string, string | undefined> = process.env): CronAuth {
  const { CRON_SECRET: secret, DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guildId } = env;
  if (!secret || !token || !guildId) return { status: 'unconfigured' };
  if (!authorization || !timingSafeEqual(sha(authorization), sha(`Bearer ${secret}`))) return { status: 'unauthorized' };
  return { status: 'ok', config: { secret, token, guildId } };
}
