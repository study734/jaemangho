import { randomUUID } from 'node:crypto';
import { countFailure } from './failure-stats';

// Only diagnostic metadata is logged. Error messages, request bodies and upstream
// URLs can contain credentials; never serialize the original exception.
export function failureDetails(error: unknown, depth = 0): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { code: 'unknown' };
  const value = error as { code?: unknown; status?: unknown; name?: unknown; stack?: unknown; cause?: unknown; phase?: unknown; elapsedMs?: unknown };
  const status = Number.isInteger(value.status) && Number(value.status) >= 100 && Number(value.status) <= 599 ? Number(value.status) : undefined;
  const code = typeof value.code === 'string' && (/^[0-9A-Z]{5}$/.test(value.code) || /^discord_http_[1-5]\d\d$/.test(value.code) ||
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'not_configured', 'invalid_response', 'network', 'timeout',
      'discord_timeout', 'discord_network', 'discord_invalid_response'].includes(value.code))
    ? value.code : value.name === 'TimeoutError' ? 'timeout' : value.name === 'AbortError' ? 'aborted'
      : status && status >= 400 ? `http_${status}` : 'unexpected';
  const locations = typeof value.stack === 'string' ? value.stack.split('\n').slice(1)
    .filter(line => /^\s+at /.test(line))
    .flatMap(line => {
      const match = /([\w.-]+\.[cm]?[jt]sx?):(\d+):(\d+)\)?$/.exec(line);
      return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
    }).slice(0, 8) : [];
  const phase = typeof value.phase === 'string' && /^[a-z]{1,16}$/.test(value.phase) ? value.phase : undefined;
  const elapsedMs = Number.isInteger(value.elapsedMs) && Number(value.elapsedMs) >= 0 ? Number(value.elapsedMs) : undefined;
  return { code, ...(status ? { status } : {}), ...(phase ? { phase } : {}), ...(elapsedMs !== undefined ? { elapsedMs } : {}), ...(locations.length ? { locations } : {}),
  ...(depth < 2 && value.cause ? { cause: failureDetails(value.cause, depth + 1) } : {}) };
}

// operation is a fixed code label, never a request URL or user-provided value.
export function reportFailure(operation: string, error: unknown, database?: {
  phase: 'connect' | 'query'; elapsedMs: number;
  pool: { total: number; idle: number; waiting: number };
}) {
  const requestId = randomUUID();
  const details = failureDetails(error);
  console.error('[failure]', { requestId, operation, ...details, ...database });
  countFailure(operation, details.code as string);
  return requestId;
}
