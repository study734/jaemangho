import { Pool } from 'pg';

// 앱 전체가 공유하는 Postgres 연결 풀. 개발 서버의 핫 리로드에서 풀이 계속 늘어나지 않게 globalThis에 둔다.
// 서버리스 인스턴스마다 풀이 생기므로 크기를 작게 두고, Neon이 절전할 수 있게 유휴 연결은 빨리 닫는다.
const g = globalThis as unknown as { __jmhPool?: Pool };

export const pool = (g.__jmhPool ??= createPool());

function createPool() {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  // 풀에서 놀고 있는 연결을 데이터베이스가 끊으면(Neon의 유휴 종료, 재시작 등) 풀이 'error'를 낸다.
  // 처리기가 없으면 처리되지 않은 예외로 프로세스가 죽을 수 있다. 끊긴 연결은 풀이 버리고 다음 요청에서 새로 연결하므로 로그만 남긴다.
  p.on('error', (e) => console.error('pg pool idle client error:', e.message));
  return p;
}
