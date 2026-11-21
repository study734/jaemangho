import { configDefaults, defineConfig } from 'vitest/config';

const integration = '**/*.integration.test.ts';

export default defineConfig({
  test: {
    // e2e/ 는 Playwright가 실행한다
    exclude: [...configDefaults.exclude, 'e2e/**'],
    projects: [
      // DB를 쓰지 않는 테스트는 파일 단위로 병렬 실행한다. 파일마다 별도 프로세스라 환경변수 변경이 섞이지 않는다.
      { extends: true, test: { name: 'unit', exclude: [...configDefaults.exclude, 'e2e/**', integration] } },
      // DB 통합 테스트(*.integration.test.ts)는 같은 TEST_DATABASE_URL을 쓰므로 파일을 하나씩 실행한다.
      // DB를 쓰는 새 테스트는 반드시 이 이름 규칙을 따른다.
      { extends: true, test: { name: 'db', include: [integration], fileParallelism: false } },
    ],
  },
});
