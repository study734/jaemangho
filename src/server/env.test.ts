import { describe, expect, it } from 'vitest';
import { envProblems } from './env';

const good = {
  DATABASE_URL: 'postgres://u:p@host/db',
  SESSION_SECRET: 'x'.repeat(40),
  DISCORD_CLIENT_ID: '1555947186691248198',
  DISCORD_CLIENT_SECRET: 'secret-value',
  DISCORD_GUILD_ID: '123456789012345678',
  RIOT_API_KEY: 'RGAPI-0000-1111',
};

describe('envProblems', () => {
  it('올바른 설정이면 문제가 없다', () => expect(envProblems(good)).toEqual([]));

  it('POSTGRES_URL만 있어도 DB 설정으로 인정한다', () => {
    const rest = Object.fromEntries(Object.entries(good).filter(([key]) => key !== 'DATABASE_URL'));
    expect(envProblems({ ...rest, POSTGRES_URL: 'postgresql://u:p@host/db' })).toEqual([]);
  });

  it('없는 변수를 모두 알려준다', () => {
    const problems = envProblems({});
    for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'RIOT_API_KEY']) {
      expect(problems.some((p) => p.startsWith(`${key}:`))).toBe(true);
    }
  });

  it('값이 변수 이름 그대로인 실수를 잡는다 (실제로 겪은 문제)', () => {
    const problems = envProblems({ ...good, DISCORD_CLIENT_ID: 'DISCORD_CLIENT_ID', DISCORD_CLIENT_SECRET: 'DISCORD_CLIENT_SECRET' });
    expect(problems).toEqual([
      'DISCORD_CLIENT_ID: 값이 변수 이름 그대로입니다. 실제 값을 넣어 주세요',
      'DISCORD_CLIENT_SECRET: 값이 변수 이름 그대로입니다. 실제 값을 넣어 주세요',
    ]);
  });

  it('형식이 틀린 값을 잡는다', () => {
    const problems = envProblems({ ...good, SESSION_SECRET: 'short', DISCORD_GUILD_ID: 'not-a-number', RIOT_API_KEY: 'abc', DATABASE_URL: 'mysql://x' });
    expect(problems.map((p) => p.split(':')[0]).sort()).toEqual(['DATABASE_URL', 'DISCORD_GUILD_ID', 'RIOT_API_KEY', 'SESSION_SECRET']);
  });

  it('값은 메시지에 절대 포함하지 않는다', () => {
    const secretish = 'super-secret-value-that-must-not-leak-1234567890';
    const text = envProblems({ ...good, DISCORD_GUILD_ID: secretish, RIOT_API_KEY: secretish }).join('\n');
    expect(text).not.toContain(secretish);
  });
});
