import { describe, expect, it, vi } from 'vitest';
import { changedCommands, registerCommand } from './register-discord-command.mjs';
import commands from '../src/server/discord-interactions/commands.json';

const env = { DISCORD_CLIENT_ID: '100000000000000001', DISCORD_GUILD_ID: '100000000000000002', DISCORD_BOT_TOKEN: 'fixture-bot-token' };
const names = ['게임추천', '패치노트', '기록', '멤버', '전적', '모집', '개선', '운영', '출처 찾기'];
// Discord가 돌려주는 모양: id·version 등이 붙고, false인 required와 정의하지 않은 필드는 생략·null로 온다.
const asRegistered = (list: typeof commands) => list.map((command, index) => ({
  id: String(900 + index), application_id: env.DISCORD_CLIENT_ID, version: '1', guild_id: env.DISCORD_GUILD_ID,
  nsfw: false, contexts: null, name_localizations: null, description_localizations: null,
  default_member_permissions: null, description: '', ...JSON.parse(JSON.stringify(command, (key, value) => key === 'required' && value === false ? undefined : value)),
}));
const discord = (registered: unknown[] = []) => vi.fn<typeof fetch>(async (_url, init) =>
  init?.method === 'GET' ? Response.json(registered) : new Response('{}'));
const posted = (fetchFn: ReturnType<typeof discord>) => fetchFn.mock.calls.filter(call => call[1]?.method === 'POST').map(call => JSON.parse(String(call[1]!.body)).name);

describe('Discord command registration', () => {
  it('defaults to a local preview without credentials or network', async () => {
    const fetchFn = vi.fn(); const log = vi.fn();
    await registerCommand({ fetchFn, log, env: {} });
    const preview = JSON.parse(log.mock.calls[0][0]);
    expect(preview.map((command: { name: string }) => command.name)).toEqual(names);
    expect(preview[0].options[0].choices.map((choice: { value: string }) => choice.value)).toEqual(['all', 'any', 'unowned']);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('upserts only new or changed commands rather than overwriting all guild commands', async () => {
    const fetchFn = discord([{ id: '1', name: '다른 봇 명령', type: 1, description: 'keep' }]); const log = vi.fn();
    await registerCommand({ args: ['--apply'], env, fetchFn, log });
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/applications\/100000000000000001\/guilds\/100000000000000002\/commands$/);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bot fixture-bot-token' } });
    expect(posted(fetchFn)).toEqual(names);
    expect(fetchFn.mock.calls.some(call => ['PUT', 'DELETE'].includes(String(call[1]?.method)))).toBe(false);
    expect(log.mock.calls.flat().join(' ')).not.toContain(env.DISCORD_BOT_TOKEN);
  });
  it('treats Discord’s returned shape of the same definitions as unchanged, and detects real edits', async () => {
    const registered = asRegistered(commands);
    expect(changedCommands(commands, registered)).toEqual([]);
    const edited = registered.map(command => command.name === '운영' ? { ...command, default_member_permissions: null } : command);
    expect(changedCommands(commands, edited).map(command => command.name)).toEqual(['운영']);
    const renamedChoice = JSON.parse(JSON.stringify(registered).replace('"모두 보유"', '"전부 보유"'));
    expect(changedCommands(commands, renamedChoice).map(command => command.name)).toEqual(['게임추천']);
    const fetchFn = discord(registered); const log = vi.fn();
    await registerCommand({ args: ['--apply'], env, fetchFn, log });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('All 9 commands are already up to date in the configured server.');
  });
  it('rejects invalid arguments and missing configuration before making changes', async () => {
    const fetchFn = vi.fn();
    for (const args of [['--unknown'], ['--apply', '--dry-run'], ['--deploy', '--apply']]) await expect(registerCommand({ args, env, fetchFn })).rejects.toThrow('Use');
    await expect(registerCommand({ args: ['--apply'], env: {}, fetchFn })).rejects.toThrow('Check DISCORD');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('reports failures without exposing response content or credentials; reruns recover', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('secret', { status: 429 }));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn })).rejects.toThrow('HTTP 429');
    const list = discord();
    list.mockImplementationOnce(async () => Response.json([])).mockImplementationOnce(async () => new Response('secret', { status: 403 }));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn: list })).rejects.toThrow('HTTP 403');
    await registerCommand({ args: ['--apply'], env, fetchFn: discord(), log: vi.fn() });
    const broken = vi.fn().mockRejectedValue(new Error(`https://discord.com/${env.DISCORD_BOT_TOKEN}`));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn: broken })).rejects.toThrow('network or timeout');
    await expect(registerCommand({ args: ['--apply'], env, fetchFn: vi.fn().mockResolvedValue(new Response('not json')) })).rejects.toThrow('unexpected');
  });
});

describe('deploy-time registration (--deploy)', () => {
  it('runs only for Vercel production builds', async () => {
    for (const VERCEL_ENV of [undefined, 'preview', 'development']) {
      const fetchFn = discord(); const log = vi.fn();
      await registerCommand({ args: ['--deploy'], env: { ...env, VERCEL_ENV }, fetchFn, log });
      expect(fetchFn).not.toHaveBeenCalled(); expect(log.mock.calls[0][0]).toContain('Skipping');
    }
    const fetchFn = discord(asRegistered(commands.filter(command => command.name !== '전적'))); const log = vi.fn();
    await registerCommand({ args: ['--deploy'], env: { ...env, VERCEL_ENV: 'production' }, fetchFn, log });
    expect(posted(fetchFn)).toEqual(['전적']);
    expect(log.mock.calls[0][0]).toMatch(/^\[discord\] Registered 전적 .* 8 unchanged/);
  });
  it('never fails the build: missing config, HTTP and network errors only warn with a status', async () => {
    const production = { ...env, VERCEL_ENV: 'production' };
    for (const [deployEnv, fetchFn, expected] of [
      [{ VERCEL_ENV: 'production' }, vi.fn(), 'Check DISCORD'],
      [production, vi.fn().mockResolvedValue(new Response('secret', { status: 401 })), 'HTTP 401'],
      [production, vi.fn().mockRejectedValue(new Error('fixture-bot-token')), 'network or timeout'],
    ] as const) {
      const warn = vi.fn();
      await expect(registerCommand({ args: ['--deploy'], env: deployEnv, fetchFn, log: vi.fn(), warn })).resolves.toBeUndefined();
      expect(warn.mock.calls[0][0]).toContain(expected);
      expect(warn.mock.calls[0][0]).toContain('Deployment continues');
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|fixture-bot-token/);
    }
  });
});

describe('Discord per-route rate limit (429) during registration', () => {
  // #124의 첫 운영 배포: 명령 8개를 연달아 POST하다 짧은 429를 받고 등록이 멈췄다.
  const burst = (limited: { retry_after?: number; header?: string; times?: number }) => {
    let posts = 0, refusals = 0;
    return vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'GET') return Response.json([]);
      posts++;
      if (posts >= 3 && refusals < (limited.times ?? 1)) {
        refusals++;
        return new Response(JSON.stringify(limited.retry_after === undefined ? {} : { retry_after: limited.retry_after, global: false }),
          { status: 429, headers: limited.header ? { 'retry-after': limited.header } : {} });
      }
      return new Response('{}');
    });
  };
  it('waits for a short retry_after and finishes registering every command', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined); const log = vi.fn();
    const fetchFn = burst({ retry_after: 0.5 });
    await registerCommand({ args: ['--apply'], env, fetchFn, log, sleep });
    expect(sleep).toHaveBeenCalledWith(600);
    expect(new Set(posted(fetchFn as never))).toEqual(new Set(names));
    expect(log.mock.calls[0][0]).toContain(`Registered ${names.join(', ')}`);
  });
  it('also honors the Retry-After header', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    await registerCommand({ args: ['--apply'], env, fetchFn: burst({ header: '1' }), log: vi.fn(), sleep });
    expect(sleep).toHaveBeenCalledWith(1100);
  });
  it('does not hold a deploy for long waits or endless limits, and says what was already registered', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(registerCommand({ args: ['--apply'], env, fetchFn: burst({ retry_after: 30 }), sleep })).rejects.toThrow(`HTTP 429. Check app/server permissions; for 429, wait before retrying. Registered before failing: ${names.slice(0, 2).join(', ')}.`);
    expect(sleep).not.toHaveBeenCalled();
    const stubborn = burst({ retry_after: 0.2, times: 99 });
    await expect(registerCommand({ args: ['--apply'], env, fetchFn: stubborn, sleep })).rejects.toThrow('HTTP 429');
    expect(sleep).toHaveBeenCalledTimes(2);
    const warn = vi.fn();
    await registerCommand({ args: ['--deploy'], env: { ...env, VERCEL_ENV: 'production' }, fetchFn: burst({ retry_after: 30 }), log: vi.fn(), warn, sleep });
    expect(warn.mock.calls[0][0]).toContain('Deployment continues');
  });
});
