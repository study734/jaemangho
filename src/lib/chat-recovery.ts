// 브라우저와 실행기의 동일한 정책. 재시도 횟수는 성공 또는 새 일일/수동 실행에서 초기화된다.
export const MAX_RECOVERY_ATTEMPTS = 6;
export interface RecoveryJob {
  id: string; status: string; startedAt?: string; finishedAt: string | null; errorCode?: string | null;
  result: { rateLimited?: boolean; truncated?: boolean; retryAfterMs?: number; warnings?: string[];
    warningCodes?: string[]; recoveryAttempt?: number; recoveryStartedAt?: string } | null;
}
export function transientChatError(code: string | null | undefined) {
  return !!code && (/^discord_http_5\d\d$/.test(code) || ['discord_http_429', 'discord_timeout', 'discord_network',
    'discord_rate_limit', 'time_budget', 'interrupted', 'database_connection', 'database_timeout', 'database_retryable'].includes(code));
}
export function chatRecoveryPlan(job: RecoveryJob | undefined, now = Date.now()) {
  if (!job) return { state: 'ready' as const, attempt: 0, nextAt: new Date(now).toISOString() };
  if (job.status === 'success') {
    const overdue = job.finishedAt && now - Date.parse(job.finishedAt) >= 30 * 3_600_000;
    return { state: overdue ? 'ready' as const : 'not_needed' as const, attempt: 0, nextAt: overdue ? new Date(Date.parse(job.finishedAt!) + 30 * 3_600_000).toISOString() : null };
  }
  const attempt = job.result?.recoveryAttempt ?? 0;
  if (job.status === 'running') return { state: 'running' as const, attempt, nextAt: null };
  const warnings = job.result?.warnings ?? [];
  const retryable = job.status === 'failed' ? transientChatError(job.errorCode)
    : warnings.length ? job.result?.warningCodes?.length === warnings.length && job.result.warningCodes.every(transientChatError)
      : !!(job.result?.rateLimited || job.result?.truncated);
  if (!retryable || !job.finishedAt) return { state: 'manual_required' as const, attempt, nextAt: null };
  const finished = Date.parse(job.finishedAt);
  const root = Date.parse(job.result?.recoveryStartedAt ?? job.finishedAt);
  if (!Number.isFinite(root) || !Number.isFinite(finished) || attempt >= MAX_RECOVERY_ATTEMPTS || now - root >= 48 * 3_600_000) {
    return { state: 'exhausted' as const, attempt, nextAt: null };
  }
  const delay = Math.max(Math.min(15 * 60_000 * 2 ** attempt, 2 * 3_600_000), job.result?.retryAfterMs ?? 0);
  const nextAt = new Date(finished + delay).toISOString();
  return { state: now >= finished + delay ? 'ready' as const : 'waiting' as const, attempt, nextAt };
}
