import { describe, expect, it, vi } from 'vitest';
import { registerCommand } from './register-discord-command.mjs';

const env = { DISCORD_CLIENT_ID: '100000000000000001', DISCORD_GUILD_ID: '100000000000000002', DISCORD_BOT_TOKEN: 'fixture-bot-token' };
describe('Discord command registration', () => {
  it('defaults to a local preview without credentials or network', async () => {
    const fetchFn = vi.fn(); const log = vi.fn();
    await registerCommand({ fetchFn, log, env: {} });
    const commands = JSON.parse(log.mock.calls[0][0]);
    expect(commands.map((command: { name: string }) => command.name)).toEqual(['게임추천', '패치노트', '기록', '멤버', '전적', '출처 찾기']);
    expect(commands[0].options[0].choices.map((choice: { value: string }) => choice.value)).toEqual(['all', 'any', 'unowned']);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('upserts only the defined commands rather than overwriting all guild commands', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}')); const log = vi.fn();
    await registerCommand({ args: ['--apply'], env, fetchFn, log });
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/applications\/100000000000000001\/guilds\/100000000000000002\/commands$/);
    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bot fixture-bot-token' } });
    expect(log.mock.calls.flat().join(' ')).not.toContain(env.DISCORD_BOT_TOKEN);
  });
  it('rejects invalid arguments and missing configuration before making changes', async () => {
    const fetchFn = vi.fn();
    for (const args of [['--unknown'], ['--apply', '--dry-run']]) await expect(registerCommand({ args, env, fetchFn })).rejects.toThrow('Use');
    await expect(registerCommand({ args: ['--apply'], env: {}, fetchFn })).rejects.toThrow('Check DISCORD');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('reports failures without exposing response content or credentials; reruns recover', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('secret', { status: 429 })).mockResolvedValue(new Response('{}'));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn })).rejects.toThrow('HTTP 429');
    await registerCommand({ args: ['--apply'], env, fetchFn, log: vi.fn() });
    fetchFn.mockRejectedValue(new Error(`https://discord.com/${env.DISCORD_BOT_TOKEN}`));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn })).rejects.toThrow('network or timeout');
  });
});
