import type { PoolClient } from 'pg';
import { pool } from '../pool';

// Pool.connect cannot be cancelled. A late checkout is returned without issuing
// queries; aborting an active transaction destroys its connection (and rolls it
// back on the server) instead of returning unfinished work to the shared pool.
export async function withAiClient<T>(signal: AbortSignal | undefined, work: (client: PoolClient) => Promise<T>, database = pool): Promise<T> {
  signal?.throwIfAborted();
  const client = await database.connect();
  let released = false;
  const abort = () => {
    if (!released) { released = true; client.release(true); }
  };
  if (signal?.aborted) {
    client.release();
    signal.throwIfAborted();
  }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    return await work(client);
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!released) { released = true; client.release(); }
  }
}
