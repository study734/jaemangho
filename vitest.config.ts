import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // e2e/ 는 Playwright가 실행한다
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // DB 통합 테스트들이 같은 DB를 쓰므로 파일을 하나씩 실행한다 (테스트 수가 적어 느리지 않다)
    fileParallelism: false,
  },
});
