import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool } from './pool';
import { testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('PostgreSQL boundary diagnostics (isolated DB)', () => {
  const pools: ReturnType<typeof createPool>[] = [];
  afterEach(async () => { await Promise.all(pools.splice(0).map(pool => pool.end())); vi.restoreAllMocks(); });
  const open = (connectionString = testDbUrl!, connectionTimeoutMillis = 500) => {
    const pool = createPool({ connectionString, max: 1, connectionTimeoutMillis });
    pools.push(pool);
    return pool;
  };

  it('captures connection errors for promises and callbacks without passwords or connection strings', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = open('postgres://test:private-password@127.0.0.1:1/private-database');
    await expect(pool.connect()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    await new Promise<void>(resolve => pool.connect(error => {
      expect(error).toMatchObject({ code: 'ECONNREFUSED' }); resolve();
    }));
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('[failure]', expect.objectContaining({
      operation: 'database.connect', code: 'ECONNREFUSED', phase: 'connect', elapsedMs: expect.any(Number),
      pool: { total: 0, idle: 0, waiting: 0 },
    }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|postgres:\/\//);
  });

  it('captures original SQLSTATE when an adapter uses a checked-out client or callback query', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = open();
    const client = await pool.connect();
    try {
      await expect(client.query('select private_missing_column from information_schema.tables')).rejects.toMatchObject({ code: '42703' });
      await new Promise<void>(resolve => client.query('select private_missing_column', error => {
        expect(error).toMatchObject({ code: '42703' }); resolve();
      }));
    } finally { client.release(); }
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('[failure]', expect.objectContaining({ operation: 'database.query', code: '42703', phase: 'query' }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private_missing_column|information_schema|select /);
    expect((await pool.query('select 1 as value')).rows).toEqual([{ value: 1 }]);
  });

  it('bounds pool starvation, reports ETIMEDOUT and recovers after the held client is released', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = open(testDbUrl!, 50);
    const client = await pool.connect();
    try { await expect(pool.query('select 1')).rejects.toThrow('timeout exceeded'); }
    finally { client.release(); }
    expect(log).toHaveBeenCalledWith('[failure]', expect.objectContaining({ operation: 'database.connect', code: 'ETIMEDOUT', phase: 'connect' }));
    expect(pool.waitingCount).toBe(0);
    expect((await pool.query('select 1 as value')).rows).toEqual([{ value: 1 }]);
  });

  it('discards a checked-out client whose query hit query_timeout so the next request gets a working connection', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = createPool({ connectionString: testDbUrl!, max: 1, query_timeout: 100 });
    pools.push(pool);
    const client = await pool.connect();
    try { await expect(client.query('select pg_sleep(5)')).rejects.toThrow('Query read timeout'); }
    finally { client.release(); }
    expect(log).toHaveBeenCalledWith('[failure]', expect.objectContaining({ operation: 'database.query', code: 'ETIMEDOUT', phase: 'query' }));
    expect(pool.totalCount).toBe(0);
    const started = Date.now();
    expect((await pool.query('select 1 as value')).rows).toEqual([{ value: 1 }]);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
