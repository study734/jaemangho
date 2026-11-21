import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';
import type { PatchNote } from '../../lib/patch-notes';

// intent/0004 R5·R6·R7
describe.skipIf(!testDbUrl)('재순이 자동 공지 (격리 DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let announce: typeof import('./announce');
  let award: typeof import('./award-post');
  const channel = '100000000000000777';
  const note = (date: string, title: string): PatchNote => ({ date, area: 'discord', title, items: ['항목'] });
  const old = [note('2026-11-20', '예전 기능')];
  const ok = () => vi.fn<typeof fetch>(async () => Response.json({ id: '100000000000000888' }));
  const status = async () => (await pool.query('select key, status, error_code as code from discord_announcements order by key')).rows;
  const reset = async () => { await pool.query('delete from discord_announcements'); await pool.query('delete from discord_award_channel'); };
  beforeAll(async () => { pool = await openTestDb(); announce = await import('./announce'); award = await import('./award-post'); });
  beforeEach(async () => { await reset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterAll(async () => { await reset(); await pool.end(); });

  it('시상식 채널이나 봇 토큰이 없으면 아무것도 하지 않는다', async () => {
    const fetchFn = ok();
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes: old })).toEqual({ status: 'disabled' });
    await award.setAwardChannel(channel, 'admin');
    expect(await announce.postAnnouncements({ token: undefined, fetchFn, notes: old })).toEqual({ status: 'disabled' });
    expect(fetchFn).not.toHaveBeenCalled(); expect(await status()).toEqual([]);
  });
  it('첫 실행은 안내만 올리고 예전 노트는 건너뛰며, 새 노트는 다음 실행에 한 번만 올린다', async () => {
    await award.setAwardChannel(channel, 'admin');
    const fetchFn = ok();
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes: old })).toEqual({ status: 'posted', key: announce.GUIDE_KEY });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://discord.com/api/v10/channels/${channel}/messages`);
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bot bot' } });
    expect(JSON.parse(String(init!.body))).toMatchObject({ content: announce.GUIDE, allowed_mentions: { parse: [] } });
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes: old })).toEqual({ status: 'none' });
    const notes = [note('2026-11-22', '새 기능'), ...old];
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes })).toEqual({ status: 'posted', key: 'notes:2026-11-22:새 기능' });
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]!.body)).content).toContain('새 기능');
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]!.body)).content).not.toContain('예전 기능');
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes })).toEqual({ status: 'none' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('Discord가 거절하면 실패로 남기고 다음 실행에서 다시 올린다', async () => {
    await award.setAwardChannel(channel, 'admin');
    const denied = vi.fn<typeof fetch>(async () => new Response('{}', { status: 403 }));
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn: denied, notes: old })).toEqual({ status: 'failed', key: announce.GUIDE_KEY, code: 'discord_http_403' });
    expect(await status()).toContainEqual({ key: announce.GUIDE_KEY, status: 'failed', code: 'discord_http_403' });
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn: ok(), notes: old })).toEqual({ status: 'posted', key: announce.GUIDE_KEY });
  });
  it('올라갔는지 모르는 결과(시간 초과·5xx)는 중복을 피하려고 다시 올리지 않는다', async () => {
    await award.setAwardChannel(channel, 'admin');
    const timeout = vi.fn<typeof fetch>(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); });
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn: timeout, notes: old })).toEqual({ status: 'unknown', key: announce.GUIDE_KEY, code: 'discord_timeout' });
    const fetchFn = ok();
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes: old })).toEqual({ status: 'none' });
    const notes = [note('2026-11-22', '새 기능'), ...old];
    const bad = vi.fn<typeof fetch>(async () => new Response('{}', { status: 502 }));
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn: bad, notes })).toMatchObject({ status: 'unknown', code: 'discord_http_502' });
    expect(await announce.postAnnouncements({ token: 'bot', fetchFn, notes })).toEqual({ status: 'none' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('동시에 실행돼도 한 번만 올린다', async () => {
    await award.setAwardChannel(channel, 'admin');
    const fetchFn = ok();
    const results = await Promise.all([1, 2, 3].map(() => announce.postAnnouncements({ token: 'bot', fetchFn, notes: old })));
    expect(results.filter(r => r.status === 'posted')).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
