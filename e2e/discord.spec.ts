import { test, expect } from '@playwright/test';
import { E2E_ENV } from './env';
import { signedDiscordRequest } from './discord-signing';

test('Discord HTTP endpoint verifies real signatures without a browser session', async ({ request }) => {
  const ping = await request.post('/api/discord/interactions', signedDiscordRequest({ type: 1 }));
  expect(ping.status()).toBe(200); expect(await ping.json()).toEqual({ type: 1 });
  const forged = signedDiscordRequest({ type: 1 }); forged.headers['x-signature-ed25519'] = '0'.repeat(128);
  expect((await request.post('/api/discord/interactions', forged)).status()).toBe(401);
  const changed = signedDiscordRequest({ type: 1 }); changed.data = '{"type":2}';
  expect((await request.post('/api/discord/interactions', changed)).status()).toBe(401);
});

test('Discord command rejects other servers before external work and refuses invalid inputs', async ({ request }) => {
  const command = { id: '100000000000000009', type: 2, application_id: E2E_ENV.DISCORD_CLIENT_ID,
    token: 'e2e-fixture-token', guild_id: '100000000000000099', member: { user: { id: '100000000000000003' } },
    data: { name: '게임추천', type: 1 } };
  const response = await request.post('/api/discord/interactions', signedDiscordRequest(command));
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ type: 4, data: { flags: 64, content: '재망호 서버에서만 이용할 수 있는 명령이에요.' } });
  const invalid = { ...command, guild_id: E2E_ENV.DISCORD_GUILD_ID, data: { name: '게임추천', type: 1,
    options: [{ name: '범위', type: 3, value: 'invalid' }] } };
  expect((await request.post('/api/discord/interactions', signedDiscordRequest(invalid))).status()).toBe(400);
});
