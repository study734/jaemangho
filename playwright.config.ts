import { defineConfig } from '@playwright/test';
import { BASE_URL, E2E_DATABASE_URL, E2E_ENV, PORT } from './e2e/env';

// 운영과 같은 방식(next build + next start)으로 서버를 띄우고 실제 브라우저(Chromium)로 시험한다.
// 디스코드 로그인은 외부 서비스라 쓰지 않고, DB에 사용자·세션을 심은 뒤 서명된 세션 쿠키를 브라우저에 넣는다.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // 테스트들이 같은 DB를 쓴다
  expect: { timeout: 10_000 }, // 서버 첫 요청(콜드 스타트)이 느릴 수 있다
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `node scripts/migrate.mjs && npm run build && npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/login`,
    // 이미 떠 있는 서버(예: DEV_LOGIN=1 개발 서버)를 재사용하면 로그인 보호 시험이 거짓으로 실패/통과한다. 포트가 차 있으면 시작 단계에서 멈춘다.
    reuseExistingServer: false,
    timeout: 240_000,
    env: { ...(process.env as Record<string, string>), ...E2E_ENV, DATABASE_URL: E2E_DATABASE_URL },
  },
});
