import { describe, expect, it, vi } from 'vitest';
import { collectUsage } from './usage-monitor.mjs';
const now = () => Date.parse('2026-10-11T10:00:00Z');
const project = { id: 'calm-cherry-01967053', consumption_period_start: '2026-10-03T00:00:00Z', compute_time_seconds: 32000, data_transfer_bytes: 21000000 };
describe('사용량 실행기', () => {
  it('고정 Neon API에만 키를 보내며 최소 사용량만 앱에 보고한다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ project: { ...project, private: 'do-not-send' } })).mockResolvedValueOnce(Response.json({ mode: 'normal' }));
    expect(await collectUsage({ key: 'private-key', secret: 'private-cron', fetchFn, now })).toEqual({ available: true, mode: 'normal' });
    expect(fetchFn.mock.calls[0][0]).toBe('https://console.neon.tech/api/v2/projects/calm-cherry-01967053');
    const report = fetchFn.mock.calls[1];
    expect(report[0]).toBe('https://jaemangho.vercel.app/api/cron/usage');
    expect(report[1].headers.Authorization).toBe('Bearer private-cron');
    expect(report[1].body).not.toContain('private-key');
    expect(report[1].body).not.toContain('do-not-send');
    expect(JSON.parse(report[1].body).sample.computeSeconds).toBe(32000);
    expect(fetchFn.mock.calls.every(call => call[1].redirect === 'error')).toBe(true);
  });
  it.each([null, { ...project, id: 'another-project' }, { ...project, compute_time_seconds: null }, { ...project, data_transfer_bytes: -1 }])('누락·잘못된 응답을 0이 아니라 확인 불가로 보고한다', async value => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ project: value })).mockResolvedValueOnce(Response.json({ mode: 'limited' }));
    expect(await collectUsage({ key: 'key', secret: 'cron', fetchFn, now })).toEqual({ available: false, mode: 'limited' });
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toMatchObject({ sample: null, errorCode: 'neon_invalid' });
  });
  it('키 누락·API 인증 실패도 보고하며 알림 재시도 대상으로 남긴다', async () => {
    const missing = vi.fn().mockResolvedValue(Response.json({ mode: 'limited' }));
    await collectUsage({ secret: 'cron', fetchFn: missing, now });
    expect(missing).toHaveBeenCalledTimes(1);
    expect(JSON.parse(missing.mock.calls[0][1].body).errorCode).toBe('unconfigured');
    const failed = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(Response.json({ mode: 'paused' }));
    expect(await collectUsage({ key: 'key', secret: 'cron', fetchFn: failed, now })).toEqual({ available: false, mode: 'paused' });
  });
});
