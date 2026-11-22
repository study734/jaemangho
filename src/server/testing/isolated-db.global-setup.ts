import { prepareTemplate } from './isolated-db';

// db 프로젝트 시작 전에 한 번: TEST_DATABASE_URL을 복제용 템플릿으로 준비한다. 없으면 DB 테스트가 건너뛰어지므로 아무것도 하지 않는다.
export default async function setup() {
  const baseUrl = process.env.TEST_DATABASE_URL;
  if (baseUrl) await prepareTemplate(baseUrl);
}
