import { afterEach, expect, it, vi } from 'vitest';
import { E2E_ENV } from '../e2e/env';
import { sendNotification } from '../src/server/operations/monitor';

afterEach(() => vi.unstubAllEnvs());

it('E2E 서버는 공용 개발 webhook으로 운영 알림을 보내지 않는다', async () => {
  vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://discord.com/api/webhooks/123456789012345678/development-token');
  const serverEnv: NodeJS.ProcessEnv = { ...process.env, ...E2E_ENV };
  vi.stubEnv('OPS_ALERT_WEBHOOK_URL', serverEnv.OPS_ALERT_WEBHOOK_URL);
  const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  expect(await sendNotification('테스트 DB의 감시 공백', undefined, fetchFn)).toBe('disabled');
  expect(fetchFn).not.toHaveBeenCalled();
});

it('E2E 서버는 공용 개발 봇 토큰으로 채팅 수집을 활성화하지 않는다', () => {
  vi.stubEnv('DISCORD_BOT_TOKEN', 'development-bot-token');
  const serverEnv: NodeJS.ProcessEnv = { ...process.env, ...E2E_ENV };
  expect(Boolean(serverEnv.DISCORD_BOT_TOKEN && serverEnv.DISCORD_GUILD_ID)).toBe(false);
});
