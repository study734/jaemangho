import { waitUntil } from '@vercel/functions';

// 서버 실패를 날짜·작업·분류별 횟수로 센다(app_failures). 진단 로그를 대신하지 않고, 어떤 기능이 자주 실패하는지만 보여준다.
// - database.* 실패는 세지 않는다: 이 기록도 DB를 쓰므로 DB 장애 때 실패가 실패를 부르는 순환을 막는다.
// - 기록이 한 번 실패하면 60초 동안 쓰지 않는다: 장애 중에 풀 연결을 더 붙잡지 않게 한다.
// - DB 주소가 없는 환경(단위 테스트, 일부 도구)에서는 아무것도 하지 않는다.
const PAUSE_MS = 60_000;
let pausedUntil = 0;

export function shouldCount(operation: string, now = Date.now(), env: Record<string, string | undefined> = process.env) {
  return !operation.startsWith('database.') && now >= pausedUntil && !!(env.DATABASE_URL || env.POSTGRES_URL);
}

export async function writeFailureCount(operation: string, code: string) {
  try {
    const { db } = await import('./db');
    const sql = await db();
    await sql`insert into app_failures (day, operation, code, count) values ((now() at time zone 'Asia/Seoul')::date, ${operation}, ${code}, 1)
      on conflict (day, operation, code) do update set count = app_failures.count + 1`;
    if (Math.random() < 0.02) await sql`delete from app_failures where day < (now() at time zone 'Asia/Seoul')::date - 90`;
  } catch {
    // 실패 원인은 pool이 database.* 로 이미 기록한다. 여기서는 다시 보고하지 않는다.
    pausedUntil = Date.now() + PAUSE_MS;
  }
}

// diagnostics.reportFailure가 부른다. 응답을 기다리게 하지 않고, 서버리스 인스턴스가 기록 전에 멈추지 않게 waitUntil에 맡긴다.
export function countFailure(operation: string, code: string) {
  if (!shouldCount(operation)) return;
  const work = writeFailureCount(operation, code);
  try { waitUntil(work); } catch { /* 요청 밖(스크립트 등)에서는 그대로 진행한다 */ }
}

export function resetFailureCountPause() { pausedUntil = 0; }
