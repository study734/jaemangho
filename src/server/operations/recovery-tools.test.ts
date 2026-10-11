import { describe, expect, it, vi } from 'vitest';
import { recover } from '../../../scripts/recover.mjs';

describe('독립 복구 실행기', () => {
  it('무료 예산 중단도 정상 정책 결과로 받고 별도 점검을 완료한다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ recovery: 'budget_paused' })).mockResolvedValueOnce(Response.json({ skipped: false, active: 1 }));
    expect(await recover({ url: 'https://site.example', secret: 'test', fetchFn })).toEqual({ recovery: 'budget_paused', verified: true });
  });
  it('복구 후 별도 요청으로 상태를 검증한다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ recovery: 'success' })).mockResolvedValueOnce(Response.json({ skipped: false, active: 0 }));
    expect(await recover({ url: 'https://site.example', secret: 'test', fetchFn })).toEqual({ recovery: 'success', verified: true });
    expect(String(fetchFn.mock.calls[0][0])).toContain('/api/cron/recovery');
    expect(String(fetchFn.mock.calls[1][0])).toContain('/api/cron/ops');
    expect(fetchFn.mock.calls[0][1].redirect).toBe('error');
  });
  it('복구 결과 저장과 후속 점검 실패를 구분한다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ recovery: 'partial' })).mockRejectedValueOnce(new Error('timeout'));
    expect(await recover({ url: 'https://site.example', secret: 'test', fetchFn })).toEqual({ recovery: 'partial', verified: false });
  });
  it('응답 유실을 즉시 재전송하지 않는다', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('unknown outcome'));
    expect(await recover({ url: 'https://site.example', secret: 'test', fetchFn })).toEqual({ recovery: 'request_failed', verified: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('잘못된 응답은 성공으로 처리하지 않는다', async () => {
    expect(await recover({ url: 'https://site.example', secret: 'test', fetchFn: async () => Response.json({}) })).toEqual({ recovery: 'invalid_response', verified: false });
  });
});

it('동시 점검 잠금은 잠깐 대기 후 재확인하며 복구 요청은 반복하지 않는다', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ recovery: 'not_needed' }))
    .mockResolvedValueOnce(Response.json({ skipped: true, active: 0 })).mockResolvedValueOnce(Response.json({ skipped: false, active: 0 }));
  const sleep = vi.fn().mockResolvedValue(undefined);
  expect(await recover({ url: 'https://site.example', secret: 'test', fetchFn, sleep })).toEqual({ recovery: 'not_needed', verified: true });
  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect(sleep).toHaveBeenCalledWith(1000);
});
