import { describe, expect, it, vi } from 'vitest';

describe('pool', () => {
  it('풀에서 놀던 연결이 끊겨 error가 나도 처리되지 않은 예외가 되지 않고 로그만 남긴다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete (globalThis as { __jmhPool?: unknown }).__jmhPool;
    const { pool } = await import('./pool');
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
    expect(() => pool.emit('error', Object.assign(new Error('private connection details'), { code: '57P01' }))).not.toThrow();
    expect(error).toHaveBeenCalledWith('[failure]', expect.objectContaining({ operation: 'database.idle-connection', code: '57P01' }));
    expect(JSON.stringify(error.mock.calls)).not.toContain('private connection details');
    error.mockRestore();
    await pool.end();
    delete (globalThis as { __jmhPool?: unknown }).__jmhPool;
  });

  describe('retryConnectOnTimeout', () => {
    const client = { release: vi.fn() };
    const timeout = () => new Error('Connection terminated due to connection timeout');
    const fake = (...results: unknown[]) => {
      const connect = vi.fn(async () => { const next = results.shift(); if (next instanceof Error) throw next; return next; });
      return { connect, pool: { connect } as never };
    };

    it('새 연결이 시간 초과되면 한 번만 다시 연결해 성공한 클라이언트를 돌려준다(promise·callback)', async () => {
      const { retryConnectOnTimeout } = await import('./pool');
      const a = fake(timeout(), client);
      expect(await (retryConnectOnTimeout(a.pool) as { connect: () => Promise<unknown> }).connect()).toBe(client);
      expect(a.connect).toHaveBeenCalledTimes(2);
      const b = fake(timeout(), client);
      const wrapped = retryConnectOnTimeout(b.pool) as { connect: (cb: (...args: unknown[]) => void) => void };
      const args = await new Promise<unknown[]>(resolve => wrapped.connect((...values) => resolve(values)));
      expect(args[0]).toBeUndefined(); expect(args[1]).toBe(client);
      (args[2] as () => void)(); expect(client.release).toHaveBeenCalled();
    });

    it('두 번째도 실패하면 그 오류를 돌려주고, 대기열 시간 초과·다른 오류는 다시 시도하지 않는다', async () => {
      const { retryConnectOnTimeout } = await import('./pool');
      const second = timeout();
      const a = fake(timeout(), second);
      await expect((retryConnectOnTimeout(a.pool) as { connect: () => Promise<unknown> }).connect()).rejects.toBe(second);
      for (const error of [new Error('timeout exceeded when trying to connect'), Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })]) {
        const b = fake(error, client);
        const wrapped = retryConnectOnTimeout(b.pool) as { connect: (cb: (...args: unknown[]) => void) => void };
        const args = await new Promise<unknown[]>(resolve => wrapped.connect((...values) => resolve(values)));
        expect(args[0]).toBe(error); expect(b.connect).toHaveBeenCalledOnce();
      }
    });
  });
});
