import { describe, expect, it } from 'vitest';
import { authorizeCron } from './cron';

const env = { CRON_SECRET: 'a'.repeat(20), DISCORD_BOT_TOKEN: 'b'.repeat(40), DISCORD_GUILD_ID: '123' };

describe('authorizeCron', () => {
  it('설정이 하나라도 없으면 누구도 통과할 수 없다', () => {
    for (const missing of Object.keys(env)) {
      expect(authorizeCron(`Bearer ${env.CRON_SECRET}`, { ...env, [missing]: '' })).toEqual({ status: 'unconfigured' });
      expect(authorizeCron(`Bearer ${env.CRON_SECRET}`, { ...env, [missing]: undefined })).toEqual({ status: 'unconfigured' });
    }
  });

  it('인증이 없거나 틀리면(길이가 달라도) unauthorized', () => {
    for (const header of [null, '', 'Bearer', 'Bearer wrong', `Bearer ${'a'.repeat(21)}`, env.CRON_SECRET, `bearer ${env.CRON_SECRET}`]) {
      expect(authorizeCron(header, env)).toEqual({ status: 'unauthorized' });
    }
  });

  it('올바른 Bearer 비밀값이면 통과하고 설정을 돌려준다', () => {
    expect(authorizeCron(`Bearer ${env.CRON_SECRET}`, env)).toEqual({ status: 'ok', config: { secret: env.CRON_SECRET, token: env.DISCORD_BOT_TOKEN, guildId: '123' } });
  });
});
