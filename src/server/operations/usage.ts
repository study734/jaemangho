import { z } from 'zod';
import { pool } from '../pool';
import { db } from '../db';
import { usageMode, USAGE_MAX_AGE, type UsageBudget, type UsageSample } from '../../lib/usage-budget';

export const usageReportSchema = z.object({
  at: z.iso.datetime(),
  sample: z.object({ at: z.iso.datetime(), periodStart: z.iso.datetime(), computeSeconds: z.number().finite().nonnegative(), transferBytes: z.number().finite().nonnegative() }).strict().nullable(),
  errorCode: z.enum(['unconfigured', 'neon_unavailable', 'neon_invalid']).nullable(),
}).strict().refine(data => data.sample ? data.errorCode === null && data.sample.at === data.at && Date.parse(data.sample.periodStart) <= Date.parse(data.at) : data.errorCode !== null);

type Row = { checked_at: Date; sample: UsageSample | null; error_code: string | null; mode: UsageBudget['mode'] };
function present(row: Row | undefined, now = Date.now()): UsageBudget {
  if (!row) return { checkedAt: null, sample: null, errorCode: 'unconfigured', mode: 'unconfigured', stale: true };
  const stale = !row.sample || now - Date.parse(row.sample.at) > USAGE_MAX_AGE;
  // 실패·키 제거로 이전 중단 상태가 풀리지 않는다. 새 성공 샘플만 정상화를 허용한다.
  const mode = row.error_code || stale ? usageMode(null, row.mode, now) : usageMode(row.sample, row.mode, now);
  return { checkedAt: new Date(row.checked_at).toISOString(), sample: row.sample, errorCode: row.error_code, mode, stale };
}
export async function usageStatus(): Promise<UsageBudget> {
  const sql = await db();
  const rows = await sql`select checked_at, sample, error_code, mode from ops_usage where id = 1`;
  return present(rows[0] as unknown as Row | undefined);
}
export async function recordUsage(report: z.infer<typeof usageReportSchema>) {
  const at = Date.parse(report.at);
  if (Math.abs(Date.now() - at) > 10 * 60_000) throw new Error('usage_report_expired');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [727277]);
    const previous = (await client.query<Row>('select * from ops_usage where id = 1')).rows[0];
    if (previous && at <= new Date(previous.checked_at).getTime()) return present(previous);
    // 이전 집계 기간·기간 내 사용량 감소로 중단 상태를 해제하지 않는다.
    let sample = report.sample;
    if (sample && previous?.sample && (Date.parse(sample.periodStart) < Date.parse(previous.sample.periodStart)
      || sample.periodStart === previous.sample.periodStart && (sample.computeSeconds < previous.sample.computeSeconds || sample.transferBytes < previous.sample.transferBytes))) sample = null;
    const error = report.errorCode ?? (report.sample && !sample ? 'neon_invalid' : null);
    const mode = usageMode(sample, previous?.mode ?? 'normal');
    await client.query(`insert into ops_usage (id, checked_at, sample, error_code, mode) values (1, $1, $2::jsonb, $3, $4)
      on conflict (id) do update set checked_at = excluded.checked_at, sample = coalesce(excluded.sample, ops_usage.sample), error_code = excluded.error_code, mode = excluded.mode`,
    [report.at, sample ? JSON.stringify(sample) : null, error, mode]);
    await client.query('commit');
    return usageStatus();
  } finally { await client.query('rollback').catch(() => {}); client.release(); }
}
