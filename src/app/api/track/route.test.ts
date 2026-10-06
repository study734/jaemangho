import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireUser, recordView } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  recordView: vi.fn(),
}));

vi.mock('@/server/viewer', () => ({ requireUser }));
vi.mock('@/server/analytics', () => ({ recordView }));
vi.mock('@/server/http', () => import('../../../server/http'));
vi.mock('@/lib/track', () => import('../../../lib/track'));

import { POST } from './route';

const request = (path: string) => new Request('http://localhost/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path }),
});

describe('화면 열람 수집', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireUser.mockResolvedValue({ id: 'user', name: '사용자', isAdmin: false });
  });

  it.each(['/steam', '/people/member', '/admin'])('관리자는 %s 열람을 기록하지 않는다', async (path) => {
    requireUser.mockResolvedValue({ id: 'admin', name: '관리자', isAdmin: true });
    expect((await POST(request(path))).status).toBe(204);
    expect(recordView).not.toHaveBeenCalled();
  });

  it.each([['/steam', '/steam'], ['/people/member', '/people/[id]']])('일반 사용자의 %s 열람은 기록한다', async (path, key) => {
    expect((await POST(request(path))).status).toBe(204);
    expect(recordView).toHaveBeenCalledExactlyOnceWith(key);
  });

  it.each([401, 403])('인증이 거부된 요청의 %s 응답을 유지한다', async (status) => {
    const denied = new Response(null, { status });
    requireUser.mockResolvedValue(denied);
    expect(await POST(request('/steam'))).toBe(denied);
    expect(recordView).not.toHaveBeenCalled();
  });

  it('목록에 없는 화면은 기록하지 않는다', async () => {
    expect((await POST(request('/unknown'))).status).toBe(204);
    expect(recordView).not.toHaveBeenCalled();
  });
});
