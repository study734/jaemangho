import { describe, expect, it, vi } from 'vitest';
import { fetchGuildMember, isGuildAdmin } from './discord';

describe('isGuildAdmin', () => {
  it('서버 소유자는 관리자', () => expect(isGuildAdmin({ owner: true, permissions: '0' })).toBe(true));
  it('Administrator(0x8) 비트가 있으면 관리자', () => {
    expect(isGuildAdmin({ owner: false, permissions: '8' })).toBe(true);
    expect(isGuildAdmin({ owner: false, permissions: '2147483647' })).toBe(true);
  });
  it('그 외는 관리자가 아니다', () => {
    expect(isGuildAdmin({ owner: false, permissions: '104324673' })).toBe(false);
    expect(isGuildAdmin({ owner: false })).toBe(false);
  });
});

describe('fetchGuildMember', () => {
  const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;
  const fakeFetch = (me: Response, guilds: Response) =>
    vi.fn(async (url: string | URL | Request) => (String(url).endsWith('/users/@me') ? me : guilds)) as unknown as typeof fetch;

  const me = { id: '42', username: 'taewook', global_name: '태욱', avatar: 'abc' };

  it('서버 멤버면 프로필과 일반 사용자 권한을 돌려준다', async () => {
    const f = fakeFetch(json(me), json([{ id: 'other' }, { id: 'G', owner: false, permissions: '0' }]));
    expect(await fetchGuildMember('tok', 'G', f)).toEqual({
      id: '42', name: '태욱', username: 'taewook',
      image: 'https://cdn.discordapp.com/avatars/42/abc.png', isAdmin: false, profile: me,
    });
  });
  it('서버 소유자는 관리자', async () => {
    const f = fakeFetch(json(me), json([{ id: 'G', owner: true, permissions: '0' }]));
    expect((await fetchGuildMember('tok', 'G', f))?.isAdmin).toBe(true);
  });
  it('표시 이름이 없으면 username, 아바타가 없으면 이미지 없음', async () => {
    const f = fakeFetch(json({ id: '1', username: 'u', global_name: null, avatar: null }), json([{ id: 'G' }]));
    expect(await fetchGuildMember('tok', 'G', f)).toMatchObject({ name: 'u', image: null });
  });
  it('서버 멤버가 아니면 null', async () => {
    expect(await fetchGuildMember('tok', 'G', fakeFetch(json(me), json([{ id: 'other' }])))).toBeNull();
  });
  it('디스코드 API가 실패하면 null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await fetchGuildMember('tok', 'G', fakeFetch(json({}, false, 401), json([])))).toBeNull();
  });
  it('토큰을 Bearer 헤더로 보낸다', async () => {
    const f = fakeFetch(json(me), json([{ id: 'G' }]));
    await fetchGuildMember('secret-token', 'G', f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer secret-token' } });
  });
});
