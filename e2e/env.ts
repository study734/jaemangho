import { DISCORD_TEST_PUBLIC_KEY } from './discord-signing';

export const PORT = Number(process.env.E2E_PORT ?? 3200);

// 사이트의 기준 주소. 서버(BETTER_AUTH_URL)와 브라우저가 같은 호스트를 써야 로그인 라이브러리의 Origin 검사를 통과한다.
export const BASE_URL = `http://localhost:${PORT}`;

// E2E 전용 DB. 단위/통합 테스트와 같은 DB를 쓰되 서로 다른 시간에 실행된다(CI는 순차 실행).
export const E2E_DATABASE_URL = (process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL) as string;

// 서버와 테스트가 같은 비밀키를 써야 테스트가 만든 세션 쿠키를 서버가 인정한다
export const E2E_ENV = {
  SESSION_SECRET: 'e2e-secret-at-least-32-characters-long!!',
  BETTER_AUTH_URL: BASE_URL,
  DISCORD_CLIENT_ID: '100000000000000001',
  DISCORD_CLIENT_SECRET: 'e2e',
  DISCORD_GUILD_ID: '100000000000000002',
  DISCORD_PUBLIC_KEY: DISCORD_TEST_PUBLIC_KEY,
  RIOT_API_KEY: 'RGAPI-e2e',
  // Next.js는 .env.local도 읽는다. 빈 값으로 덮어 공용 봇·운영 알림을 테스트에서 사용하지 않는다.
  DISCORD_BOT_TOKEN: '',
  OPS_ALERT_WEBHOOK_URL: '',
  NVIDIA_API_KEY: '',
};
