import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool } from '../pool';
import { testDbUrl } from '../testing/db';
import { withAiClient } from './database';

describe.skipIf(!testDbUrl)('AI deadline cancellation (isolated DB)', () => {
  const pools: ReturnType<typeof createPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map(pool => pool.end())); vi.restoreAllMocks(); });
  const open = () => {
    const pool = createPool({ connectionString: testDbUrl, max: 1, connectionTimeoutMillis: 500 });
    pools.push(pool);
    return pool;
  };

  it('returns a late checkout without starting queries or leaking a client', async () => {
    const pool = open();
    const held = await pool.connect();
    const controller = new AbortController();
    const work = vi.fn(async () => 'should not run');
    const pending = withAiClient(controller.signal, work, pool);
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    held.release();
    await failure;
    expect(work).not.toHaveBeenCalled();
    expect(pool.idleCount).toBe(1);
    expect(pool.waitingCount).toBe(0);
  });

  it('destroys a timed-out transaction and rolls back its writes before a fresh client is reused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = open();
    const table = 'ai_deadline_rollback_fixture';
    await pool.query(`create table ${table}(value int)`);
    const controller = new AbortController();
    let entered!: () => void;
    const sleeping = new Promise<void>(resolve => { entered = resolve; });
    try {
      const pending = withAiClient(controller.signal, async client => {
        await client.query('begin');
        await client.query(`insert into ${table} values (1)`);
        // PostgreSQL may finish the active statement before noticing a closed
        // socket. Keep that statement short; closing it must still reject the
        // client-side query, and the transaction must never commit its insert.
        const query = client.query('select pg_sleep(0.2)');
        entered();
        await query;
      }, pool);
      const failure = expect(pending).rejects.toBeInstanceOf(Error);
      await sleeping;
      controller.abort();
      await failure;
      expect((await pool.query(`select count(*)::int as n from ${table}`)).rows).toEqual([{ n: 0 }]);
      expect(pool.waitingCount).toBe(0);
    } finally { await pool.query(`drop table ${table}`); }
  });
});
