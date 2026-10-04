import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('./pool', () => ({ pool: { query } }));

import { checkHealth } from './health';

describe('checkHealth', () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('DB가 응답하면 true', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await checkHealth()).toBe(true);
  });

  it('DB가 실패하면 던지지 않고 false', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    expect(await checkHealth()).toBe(false);
  });
});
