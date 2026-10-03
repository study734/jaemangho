import { migrate } from '../../../scripts/migrate.mjs';

// DB 통합 테스트 공용 준비: TEST_DATABASE_URL에 실제 배포와 같은 방법(migrations/*.sql)으로 스키마를 만들고,
// 앱의 DATABASE_URL로 쓴다. 앱 모듈은 import 시점에 환경변수를 읽으므로 반드시 환경변수를 정한 뒤에 동적으로 불러온다.
export const testDbUrl = process.env.TEST_DATABASE_URL;

export async function openTestDb() {
  await migrate({ url: testDbUrl! });
  Object.assign(process.env, {
    DATABASE_URL: testDbUrl,
    SESSION_SECRET: 'integration-test-secret-at-least-32-chars',
    DISCORD_CLIENT_ID: 'cid',
    DISCORD_CLIENT_SECRET: 'csecret',
    DISCORD_GUILD_ID: 'G',
  });
  const { pool } = await import('../pool');
  return pool;
}

// 마이그레이션 자체를 시험할 때 쓰는 일회용 빈 데이터베이스. 서버의 postgres DB로 접속해 만들고 지운다.
export async function createScratchDb() {
  const { default: pg } = await import('pg');
  const name = `jmh_scratch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const withDb = (db: string) => {
    const url = new URL(testDbUrl!);
    url.pathname = `/${db}`;
    return url.toString();
  };
  const admin = new pg.Client({ connectionString: withDb('postgres') });
  await admin.connect();
  await admin.query(`create database "${name}"`);
  return {
    url: withDb(name),
    async drop() {
      await admin.query(`drop database if exists "${name}" with (force)`);
      await admin.end();
    },
  };
}
