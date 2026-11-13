import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('weekly award auto-post (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let post: typeof import('./award-post');
  const now = new Date('2026-11-10T00:00:00Z');
  const week = '2026-11-02';
  const channel = '100000000000000777';
  const ok = () => vi.fn<typeof fetch>(async () => Response.json({ id: '100000000000000888' }));
  const reset = async () => {
    await pool.query('delete from discord_award_posts'); await pool.query('delete from discord_award_channel');
    await pool.query('delete from chat_awards where week_start >= $1::date - 40', [week]);
  };
  beforeAll(async () => { pool = await openTestDb(); post = await import('./award-post'); });
  beforeEach(async () => {
    await reset();
    await pool.query(`insert into chat_awards (week_start, title, author_id, author_name, value) values
      ($1, 'talker', 'a1', '*Loud*', 1234), ($1, 'lurker', 'a2', 'Quiet', 0)`, [week]);
  });
  afterAll(async () => { await reset(); await pool.end(); });

  it('stays off until an admin sets a channel, and without a bot token', async () => {
    const fetchFn = ok();
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn, now })).toEqual({ status: 'disabled' });
    await post.setAwardChannel(channel, 'admin');
    expect(await post.postWeeklyAwards({ token: undefined, fetchFn, now })).toEqual({ status: 'disabled' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('posts the latest week once to the channel, without lurkers or pings', async () => {
    await post.setAwardChannel(channel, 'admin');
    const fetchFn = ok();
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn, now })).toEqual({ status: 'posted', week, channelId: channel });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://discord.com/api/v10/channels/${channel}/messages`);
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bot bot' } });
    const body = JSON.parse(String(init!.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.content).toContain('## 🏆 재망호 주간 시상식\n**11월 2일(월) ~ 11월 8일(일)**');
    expect(body.content).toContain('🗣️ 수다 갤러 — **\\*Loud\\***\n-# 메시지 1,234개 · 가장 말을 많이 한 사람');
    expect(body.content).not.toMatch(/\]\(https?:/); // 링크 미리보기 없음
    expect(body.content).not.toContain('Quiet'); expect(body.content).not.toContain('눈팅러');
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn, now })).toEqual({ status: 'already_posted' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await pool.query('select status, message_id from discord_award_posts')).rows).toEqual([{ status: 'posted', message_id: '100000000000000888' }]);
  });
  it('records a failure without the response body and retries on the next run', async () => {
    await post.setAwardChannel(channel, 'admin');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const denied = vi.fn<typeof fetch>(async () => new Response('secret body', { status: 403 }));
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: denied, now })).toEqual({ status: 'failed', week, channelId: channel, code: 'discord_http_403' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret body');
    const broken = vi.fn<typeof fetch>(async () => { throw new Error('bot-token-leak'); });
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: broken, now })).toMatchObject({ status: 'failed', code: 'discord_network' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('bot-token-leak');
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: ok(), now })).toMatchObject({ status: 'posted' });
  });
  it('reclaims a post stuck in posting for over 10 minutes, but not a fresh one (no double post)', async () => {
    await post.setAwardChannel(channel, 'admin');
    await pool.query(`insert into discord_award_posts (week_start, channel_id, status) values ($1, $2, 'posting')`, [week, channel]);
    const fetchFn = ok();
    const [first, second] = await Promise.all([post.postWeeklyAwards({ token: 'bot', fetchFn, now }), post.postWeeklyAwards({ token: 'bot', fetchFn, now })]);
    expect([first, second]).toEqual([{ status: 'already_posted' }, { status: 'already_posted' }]);
    await pool.query(`update discord_award_posts set updated_at = now() - interval '11 minutes'`);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn, now })).toMatchObject({ status: 'posted' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('skips weeks with only lurkers, weeks older than 14 days, and can be turned off', async () => {
    await post.setAwardChannel(channel, 'admin');
    await pool.query(`delete from chat_awards where week_start = $1 and title = 'talker'`, [week]);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: ok(), now })).toEqual({ status: 'no_awards' });
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: ok(), now: new Date('2026-12-01T00:00:00Z') })).toEqual({ status: 'no_awards' });
    expect(await post.awardChannel()).toBe(channel);
    await post.setAwardChannel(null, 'admin');
    expect(await post.awardChannel()).toBeNull();
  });
});
