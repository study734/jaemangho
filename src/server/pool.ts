import { Pool } from 'pg';

// 앱 전체가 공유하는 Postgres 연결 풀. 개발 서버의 핫 리로드에서 풀이 계속 늘어나지 않게 globalThis에 둔다.
// 서버리스 인스턴스마다 풀이 생기므로 크기를 작게 두고, Neon이 절전할 수 있게 유휴 연결은 빨리 닫는다.
const g = globalThis as unknown as { __jmhPool?: Pool };

export const pool = (g.__jmhPool ??= new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
}));
