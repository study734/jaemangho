import { describe, expect, it, vi } from 'vitest';
import { observeDatabaseCall } from './pool-observer';

describe('database failure observation', () => {
  it('preserves promise results, the receiver and the original rejected error', async () => {
    const error = Object.assign(new Error('secret SQL and password'), { code: '08P01' });
    const failed = vi.fn();
    const client = { value: 4, query: observeDatabaseCall(async function (this: { value: number }, fail: boolean) {
      if (fail) throw error;
      return this.value;
    }, failed) };
    await expect(client.query(false)).resolves.toBe(4);
    expect(failed).not.toHaveBeenCalled();
    await expect(client.query(true)).rejects.toBe(error);
    expect(failed).toHaveBeenCalledExactlyOnceWith(error, expect.any(Number));
  });

  it('preserves callback results and errors without converting the API to a promise', () => {
    const failed = vi.fn();
    const error = new Error('private details');
    const callback = vi.fn();
    const call = observeDatabaseCall((fail: boolean, done: (error: Error | null, value?: number) => void) => {
      queueMicrotask(() => done(fail ? error : null, fail ? undefined : 7));
      return 'original return';
    }, failed);
    expect(call(false, callback)).toBe('original return');
    expect(call(true, callback)).toBe('original return');
    return new Promise<void>(resolve => queueMicrotask(() => {
      expect(callback.mock.calls).toEqual([[null, 7], [error, undefined]]);
      expect(failed).toHaveBeenCalledExactlyOnceWith(error, expect.any(Number));
      resolve();
    }));
  });

  it('reports synchronous driver errors without swallowing them', () => {
    const error = new Error('invalid query');
    const failed = vi.fn();
    expect(() => observeDatabaseCall(() => { throw error; }, failed)()).toThrow(error);
    expect(failed).toHaveBeenCalledExactlyOnceWith(error, expect.any(Number));
  });
});
