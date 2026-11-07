import { reportFailure } from './diagnostics';
import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import { observeDatabase } from './pool-observer';
import { postgresUrl } from './postgres-url.mjs';

// 앱 전체가 공유하는 Postgres 연결 풀. 개발 서버의 핫 리로드에서 풀이 계속 늘어나지 않게 globalThis에 둔다.
// 서버리스 인스턴스마다 풀이 생기므로 크기를 작게 두고, Neon이 절전할 수 있게 유휴 연결은 빨리 닫는다.
// 운영 로그(2026-11)에서 두 가지 연결 실패가 반복됐다:
// - 빈 풀(total 0)에서 새 연결이 5초를 넘겨 실패: 절전한 Neon(iad1)을 깨우는 시간 + 서울/홍콩 함수와의 왕복. 연결 대기는 10초까지 둔다.
// - 연결 3개가 모두 대여 중(idle 0)인 채로 수 분간 멈춤: 인스턴스가 정지된 동안 끊긴 소켓을 재사용해 응답 없는 쿼리가 연결을 붙잡았다.
//   attachDatabasePool이 정지 전에 유휴 연결을 정리하게 하고, query_timeout으로 응답 없는 연결을 오류로 끝내 풀에서 버리게 한다.
const g = globalThis as unknown as { __jmhPool?: Pool };

export const pool = (g.__jmhPool ??= createPool());

export function createPool(options: PoolConfig = {}) {
  const p = observeDatabase(new Pool({
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    keepAlive: true,
    ...options,
    connectionString: postgresUrl(options.connectionString ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL),
  }));
  // 풀에서 놀고 있는 연결을 데이터베이스가 끊으면(Neon의 유휴 종료, 재시작 등) 풀이 'error'를 낸다.
  // 처리기가 없으면 처리되지 않은 예외로 프로세스가 죽을 수 있다. 끊긴 연결은 풀이 버리고 다음 요청에서 새로 연결하므로 로그만 남긴다.
  p.on('error', (e) => reportFailure('database.idle-connection', e));
  attachDatabasePool(p);
  return retryConnectOnTimeout(p);
}

// 새 연결이 시간 초과로 끝나면 한 번만 다시 연결한다(연결 시도에는 부작용이 없다).
// 운영(2026-11)에서 빈 풀의 새 연결이 두 가지로 실패했다: Neon이 절전에서 깨는 동안 10초를 넘긴 경우,
// 요청이 끝나 인스턴스가 정지된 사이 멈춰 있던 연결 시도가 재개 직후 시간 초과로 끝나는 경우(Better Auth
// 스키마 확인처럼 여러 요청이 공유하는 첫 연결이면 다음 요청이 그 실패를 받는다). 두 경우 모두 바로 다시 연결하면
// 대개 성공한다. 풀이 가득 차 대기열에서 시간 초과된 경우('timeout exceeded when trying to connect')는
// 부하만 늘리므로 다시 시도하지 않는다. 각 시도의 실패는 observeDatabase가 그대로 기록한다.
const NEW_CONNECTION_TIMEOUT = 'Connection terminated due to connection timeout';
type ConnectCallback = (error: Error | undefined, client: PoolClient | undefined, done: (release?: boolean | Error) => void) => void;

export function retryConnectOnTimeout<T extends Pick<Pool, 'connect'>>(target: T): T {
  const connect = target.connect.bind(target) as () => Promise<PoolClient>;
  target.connect = function (callback?: ConnectCallback) {
    const result = connect().catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== NEW_CONNECTION_TIMEOUT) throw error;
      return connect();
    });
    if (typeof callback !== 'function') return result;
    result.then(client => callback(undefined, client, client.release.bind(client)), (error: Error) => callback(error, undefined, () => {}));
  } as Pool['connect'];
  return target;
}
