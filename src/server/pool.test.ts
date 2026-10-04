import { describe, expect, it, vi } from 'vitest';

describe('pool', () => {
  it('풀에서 놀던 연결이 끊겨 error가 나도 처리되지 않은 예외가 되지 않고 로그만 남긴다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete (globalThis as { __jmhPool?: unknown }).__jmhPool;
    const { pool } = await import('./pool');
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
    expect(() => pool.emit('error', new Error('terminating connection due to administrator command'))).not.toThrow();
    expect(error).toHaveBeenCalledWith('pg pool idle client error:', 'terminating connection due to administrator command');
    error.mockRestore();
    await pool.end();
    delete (globalThis as { __jmhPool?: unknown }).__jmhPool;
  });
});
