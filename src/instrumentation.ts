// 서버가 시작될 때 한 번 실행된다. 잘못된 환경변수를 로그에 바로 알린다 (빌드 중에는 실행하지 않는다).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.NODE_ENV !== 'production') return;

  const { envProblems } = await import('@/server/env');
  const problems = envProblems();
  if (problems.length > 0) {
    console.error(`[env] 환경변수 점검 실패 ${problems.length}건:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}
