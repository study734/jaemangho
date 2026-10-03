// DB 통합 테스트 공용 준비: TEST_DATABASE_URL을 앱의 DATABASE_URL로 쓰고 스키마(마이그레이션)를 만든다.
// 앱 모듈은 import 시점에 환경변수를 읽으므로 반드시 환경변수를 정한 뒤에 동적으로 불러온다.
export const testDbUrl = process.env.TEST_DATABASE_URL;

export async function openTestDb() {
  Object.assign(process.env, {
    DATABASE_URL: testDbUrl,
    SESSION_SECRET: 'integration-test-secret-at-least-32-chars',
    DISCORD_CLIENT_ID: 'cid',
    DISCORD_CLIENT_SECRET: 'csecret',
    DISCORD_GUILD_ID: 'G',
  });
  const [{ pool }, { db }] = await Promise.all([import('../pool'), import('../db')]);
  await db();
  return pool;
}
