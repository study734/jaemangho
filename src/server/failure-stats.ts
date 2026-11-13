import { waitUntil } from '@vercel/functions';

// 서버 실패를 날짜·작업·분류별 횟수로 센다(app_failures). 진단 로그를 대신하지 않고, 어떤 기능이 자주 실패하는지만 보여준다.
// 무료 DB(Neon Free) 부담을 늘리지 않기 위한 제약:
// - 실패마다 쓰지 않는다. 인스턴스 안에서 모아 한 번에 하나의 쓰기만 실행하고, 쓰는 동안 생긴 실패는 다음 한 번에 합친다.
//   외부 장애로 한 요청에서 실패가 수십 번 나도 쓰기는 한두 번이고, 크기 3인 연결 풀을 오래 차지하지 않는다.
// - 실패를 기록하는 요청은 이미 DB를 쓴 요청이라 절전 중인 DB를 새로 깨우지 않는다(헬스 검사의 DB 실패는 아래 중단으로 끝난다).
// - database.* 실패는 세지 않는다: 이 기록도 DB를 쓰므로 DB 장애 때 실패가 실패를 부르는 순환을 막는다.
// - 기록이 한 번 실패하면 60초 동안 쓰지 않고 모은 횟수도 버린다(정확한 횟수보다 장애 중 부하를 줄이는 쪽을 택한다).
// - DB 주소가 없는 환경(단위 테스트, 일부 도구)에서는 아무것도 하지 않는다.
const PAUSE_MS = 60_000;
let pausedUntil = 0;
let pending = new Map<string, FailureCount>();
let running: Promise<void> | null = null;

export interface FailureCount { operation: string; code: string; count: number }

export function shouldCount(operation: string, now = Date.now(), env: Record<string, string | undefined> = process.env) {
  return !operation.startsWith('database.') && now >= pausedUntil && !!(env.DATABASE_URL || env.POSTGRES_URL);
}

// 모은 횟수를 한 문장으로 더한다. 실패하면 false.
export async function writeFailureCounts(batch: FailureCount[]): Promise<boolean> {
  try {
    const { db } = await import('./db');
    const sql = await db();
    await sql`insert into app_failures (day, operation, code, count)
      select (now() at time zone 'Asia/Seoul')::date, f.operation, f.code, f.count
      from unnest(${batch.map((f) => f.operation)}::text[], ${batch.map((f) => f.code)}::text[], ${batch.map((f) => f.count)}::int[]) as f(operation, code, count)
      on conflict (day, operation, code) do update set count = app_failures.count + excluded.count`;
    if (Math.random() < 0.02) await sql`delete from app_failures where day < (now() at time zone 'Asia/Seoul')::date - 90`;
    return true;
  } catch {
    // 실패 원인은 pool이 database.* 로 이미 기록한다. 여기서는 다시 보고하지 않는다.
    pausedUntil = Date.now() + PAUSE_MS;
    return false;
  }
}

async function drain() {
  try {
    await null; // 같은 순간에 연달아 난 실패를 첫 쓰기에 함께 담는다
    while (pending.size && Date.now() >= pausedUntil) {
      const batch = [...pending.values()];
      pending = new Map();
      await writeFailureCounts(batch);
    }
  } finally {
    pending = new Map();
    running = null;
  }
}

// diagnostics.reportFailure가 부른다. 응답을 기다리게 하지 않고, 서버리스 인스턴스가 기록 전에 멈추지 않게 waitUntil에 맡긴다.
export function countFailure(operation: string, code: string) {
  if (!shouldCount(operation)) return;
  const key = `${operation}\n${code}`;
  const entry = pending.get(key);
  if (entry) entry.count += 1;
  else pending.set(key, { operation, code, count: 1 });
  if (running) return;
  running = drain();
  try { waitUntil(running); } catch { /* 요청 밖(스크립트 등)에서는 그대로 진행한다 */ }
}

// 테스트용: 진행 중인 기록을 기다린다.
export const settleFailureCounts = () => running ?? Promise.resolve();
export function resetFailureCountPause() { pausedUntil = 0; }
