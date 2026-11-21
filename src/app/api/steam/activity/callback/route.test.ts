import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as start } from '../start/route';
import { GET as callback } from './route';
import { beginSteamLink, finishSteamLink } from '@/server/activity/steam-openid';
import { requireUser } from '@/server/viewer';

vi.mock('@/server/viewer', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/http', () => ({ serverError: vi.fn() }));
vi.mock('@/server/activity/steam-openid', () => ({ beginSteamLink: vi.fn(), finishSteamLink: vi.fn(), SteamAccountAlreadyLinkedError: class extends Error {} }));

// intent/0005 R3: /connect/steam에서 시작한 Steam 본인 확인은 그 화면으로 돌아온다. 그 외 값은 기존처럼 /steam.
describe('Steam 본인 확인 돌아오는 곳', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1', name: 'U', isAdmin: false });
    vi.mocked(beginSteamLink).mockResolvedValue({ state: 's', url: 'https://steamcommunity.com/openid/login' });
    vi.mocked(finishSteamLink).mockResolvedValue('76561199000005001');
  });
  it('시작할 때 from=connect만 콜백 주소에 담는다', async () => {
    await start(new NextRequest('http://localhost/api/steam/activity/start?from=connect'));
    expect(new URL(vi.mocked(beginSteamLink).mock.calls[0][1]).searchParams.get('from')).toBe('connect');
    await start(new NextRequest('http://localhost/api/steam/activity/start?from=https://evil.example'));
    expect(new URL(vi.mocked(beginSteamLink).mock.calls[1][1]).searchParams.has('from')).toBe(false);
  });
  it('from=connect면 /connect/steam, 아니면 /steam으로 결과와 함께 돌려보낸다', async () => {
    const connect = await callback(new NextRequest('http://localhost/api/steam/activity/callback?from=connect&state=s'));
    expect(new URL(connect.headers.get('location')!).pathname).toBe('/connect/steam');
    expect(new URL(connect.headers.get('location')!).searchParams.get('steam-link')).toBe('verified');
    const web = await callback(new NextRequest('http://localhost/api/steam/activity/callback?from=elsewhere&state=s'));
    expect(new URL(web.headers.get('location')!).pathname).toBe('/steam');
  });
});
