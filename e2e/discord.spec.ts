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

test('new Discord commands and party buttons parse through the deployed route and stay server-gated', async ({ request }) => {
  const base = { id: '100000000000000009', application_id: E2E_ENV.DISCORD_CLIENT_ID, token: 'e2e-fixture-token',
    guild_id: '100000000000000099', member: { user: { id: '100000000000000003' } } };
  for (const data of [{ name: '기록', type: 1 }, { name: '멤버', type: 1 },
    { name: '전적', type: 1, options: [{ name: '닉네임', type: 3, value: 'Hide on bush#KR1' }] }]) {
    const response = await request.post('/api/discord/interactions', signedDiscordRequest({ ...base, type: 2, data }));
    expect(await response.json()).toMatchObject({ type: 4, data: { flags: 64 } });
  }
  for (const data of [{ name: '모집', type: 1, options: [{ name: '인원', type: 4, value: 4 }] }]) {
    expect(await (await request.post('/api/discord/interactions', signedDiscordRequest({ ...base, type: 2, data }))).json()).toMatchObject({ type: 4, data: { flags: 64 } });
  }
  const lobbyButton = { ...base, type: 3, data: { component_type: 2, custom_id: 'lobby:100000000000000009:join' } };
  expect(await (await request.post('/api/discord/interactions', signedDiscordRequest(lobbyButton))).json()).toMatchObject({ type: 4 });
  const tooMany = { ...base, guild_id: E2E_ENV.DISCORD_GUILD_ID, type: 2, data: { name: '모집', type: 1, options: [{ name: '인원', type: 4, value: 25 }] } };
  expect((await request.post('/api/discord/interactions', signedDiscordRequest(tooMany))).status()).toBe(400);
  const button = { ...base, type: 3, data: { component_type: 2, custom_id: 'party:100000000000000009:deals' } };
  expect(await (await request.post('/api/discord/interactions', signedDiscordRequest(button))).json()).toMatchObject({ type: 4 });
  const invalid = { ...base, guild_id: E2E_ENV.DISCORD_GUILD_ID, type: 2, data: { name: '기록', type: 1, options: [{ name: '없음', type: 1 }] } };
  expect((await request.post('/api/discord/interactions', signedDiscordRequest(invalid))).status()).toBe(400);
});

test('admin commands reject malformed permissions and unknown subcommands before any deferred work', async ({ request }) => {
  const command = { id: '100000000000000009', type: 2, application_id: E2E_ENV.DISCORD_CLIENT_ID, token: 'e2e-fixture-token',
    guild_id: E2E_ENV.DISCORD_GUILD_ID, member: { user: { id: '100000000000000003' }, permissions: 'all' }, data: { name: '개선', type: 1 } };
  expect((await request.post('/api/discord/interactions', signedDiscordRequest(command))).status()).toBe(400);
  const unknown = { ...command, member: { user: { id: '100000000000000003' }, permissions: '8' }, data: { name: '운영', type: 1, options: [{ name: '차단', type: 1 }] } };
  expect((await request.post('/api/discord/interactions', signedDiscordRequest(unknown))).status()).toBe(400);
  // 다른 서버에서 온 관리자 명령은 권한 비트와 관계없이 작업을 예약하지 않는다.
  const other = { ...unknown, guild_id: '100000000000000099', data: { name: '운영', type: 1, options: [{ name: '상태', type: 1 }] } };
  expect(await (await request.post('/api/discord/interactions', signedDiscordRequest(other))).json()).toMatchObject({ type: 4 });
});
