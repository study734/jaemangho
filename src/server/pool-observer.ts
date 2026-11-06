import type { Pool } from 'pg';
import { reportFailure } from './diagnostics';

// pg and Kysely use both callbacks and promises. Preserve the original calling
// convention and error identity; never attach SQL, parameters or connection data.
export function observeDatabaseCall<T extends (...args: never[]) => unknown>(call: T, failed: (error: unknown, elapsedMs: number) => void, current = () => call): T {
  return new Proxy(call, {
    apply(_target, receiver, args) {
      const started = Date.now();
      const report = (error: unknown) => failed(error, Date.now() - started);
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        args[args.length - 1] = function (this: unknown, ...values: unknown[]) {
          if (values[0]) report(values[0]);
          return Reflect.apply(callback, this, values);
        };
      }
      let result;
      try { result = Reflect.apply(current(), receiver, args); }
      catch (error) { report(error); throw error; }
      if (typeof callback !== 'function' && result && typeof result.then === 'function') {
        return result.catch((error: unknown) => { report(error); throw error; });
      }
      return result;
    },
  });
}

const isQueryReadTimeout = (error: unknown) => error instanceof Error && error.message === 'Query read timeout';

export function observeDatabase(pool: Pool) {
  const failed = (phase: 'connect' | 'query', error: unknown, elapsedMs: number) => {
    // pg pool timeouts have no code. Classify only the driver's exact fixed
    // messages; never include the raw message in diagnostic metadata.
    if (phase === 'connect' && error instanceof Error && [
      'timeout exceeded when trying to connect', 'Connection terminated due to connection timeout',
    ].includes(error.message)) error = Object.assign(new Error('Database connection timeout', { cause: error }), { code: 'ETIMEDOUT' });
    if (phase === 'query' && isQueryReadTimeout(error)) error = Object.assign(new Error('Database query timeout', { cause: error }), { code: 'ETIMEDOUT' });
    reportFailure(`database.${phase}`, error, {
      phase, elapsedMs, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    });
  };
  pool.connect = observeDatabaseCall(pool.connect, (error, elapsed) => failed('connect', error, elapsed));
  pool.on('connect', client => {
    // Keep later prototype instrumentation (debuggers/query-count tests) visible.
    const prototype = Object.getPrototypeOf(client) as { query: typeof client.query };
    const original = client.query;
    const current = Object.hasOwn(client, 'query') ? () => original : () => prototype.query;
    client.query = observeDatabaseCall(original, (error, elapsed) => {
      // pg's query_timeout only stops waiting: the unanswered query stays on the
      // connection, and a plain release() would hand that stuck client to the next
      // request. Ending it makes the pool discard it on release.
      if (isQueryReadTimeout(error) && !(client as unknown as { _ending?: boolean })._ending) client.end().catch(() => {});
      failed('query', error, elapsed);
    }, current);
  });
  return pool;
}
