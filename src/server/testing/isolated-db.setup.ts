import { afterAll } from 'vitest';
import { cloneTemplate } from './isolated-db';

// db 프로젝트의 테스트 파일마다 테스트 파일보다 먼저 실행된다. 이 파일 전용 DB로 TEST_DATABASE_URL을 바꿔
// testing/db.ts의 testDbUrl·createScratchDb가 모두 전용 DB 서버 주소를 쓰게 한다.
const baseUrl = process.env.TEST_DATABASE_URL;

if (baseUrl) {
  const db = await cloneTemplate(baseUrl);
  process.env.TEST_DATABASE_URL = db.url;
  afterAll(() => db.drop());
}
