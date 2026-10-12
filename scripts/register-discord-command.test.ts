import { describe, expect, it, vi } from 'vitest';
import { registerCommand } from './register-discord-command.mjs';

const env = { DISCORD_CLIENT_ID: '100000000000000001', DISCORD_GUILD_ID: '100000000000000002', DISCORD_BOT_TOKEN: 'fixture-bot-token' };
describe('Discord command registration', () => {
  it('defaults to a local preview without credentials or network', async () => {
    const fetchFn = vi.fn(); const log = vi.fn();
    await registerCommand({ fetchFn, log, env: {} });
    const command = JSON.parse(log.mock.calls[0][0]);
    expect(command.name).toBe('게임추천');
    expect(command.options[0].choices.map((choice: { value: string }) => choice.value)).toEqual(['all', 'any', 'unowned']);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('upserts only the chosen command rather than overwriting all guild commands', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}')); const log = vi.fn();
    await registerCommand({ args: ['--apply'], env, fetchFn, log });
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/applications\/100000000000000001\/guilds\/100000000000000002\/commands$/);
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
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('secret', { status: 429 })).mockResolvedValueOnce(new Response('{}'));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn })).rejects.toThrow('HTTP 429');
    await registerCommand({ args: ['--apply'], env, fetchFn, log: vi.fn() });
    fetchFn.mockRejectedValue(new Error(`https://discord.com/${env.DISCORD_BOT_TOKEN}`));
    await expect(registerCommand({ args: ['--apply'], env, fetchFn })).rejects.toThrow('network or timeout');
  });
});
