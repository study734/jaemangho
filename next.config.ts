import type { NextConfig } from 'next';
import { securityHeaders } from './src/server/security-headers';

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [{ source: '/:path*', headers: [...securityHeaders] }];
  },
  // next dev가 AGENTS.md/CLAUDE.md를 자동 생성하지 않게 한다 (에이전트 지침은 직접 관리)
  agentRules: false,
  // 기존 E2E 전용 DB 설정이 전달된 테스트 빌드에서만 파일 캐시를 사용한다.
  // fixture가 테스트 사이 캐시를 초기화할 수 있게 하며 실제 TTL과 운영 기본 설정은 유지한다.
  ...(process.env.E2E_DATABASE_URL ? { cacheMaxMemorySize: 0 } : {}),
};

export default nextConfig;
