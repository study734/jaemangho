import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  // next dev가 AGENTS.md/CLAUDE.md를 자동 생성하지 않게 한다 (에이전트 지침은 직접 관리)
  agentRules: false,
};

export default nextConfig;
