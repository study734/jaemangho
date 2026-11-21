import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('weekly award auto-post (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let post: typeof import('./award-post');
  const now = new Date('2026-11-10T00:00:00Z');
  const week = '2026-11-02';
  const channel = '100000000000000777';
  const ok = () => vi.fn<typeof fetch>(async () => Response.json({ id: '100000000000000888' }));
  // 채널 조회(GET)는 recent, 게시(POST)는 ok와 같다.
  const channelWith = (recent: unknown[]) => vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === 'POST' ? Response.json({ id: '100000000000000888' }) : Response.json(recent));
  const methods = (fetchFn: ReturnType<typeof ok>) => fetchFn.mock.calls.map(([, init]) => init?.method ?? 'GET');
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
    // 403은 게시되지 않은 것이 확실하므로 다음 실행은 찾지 않고 바로 올린다.
    const retry = channelWith([]);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: retry, now })).toMatchObject({ status: 'posted' });
    expect(methods(retry)).toEqual(['POST']);
    await pool.query(`update discord_award_posts set status = 'failed', error_code = 'discord_http_403'`);
    const broken = vi.fn<typeof fetch>(async () => { throw new Error('bot-token-leak'); });
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: broken, now })).toMatchObject({ status: 'failed', code: 'discord_network' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('bot-token-leak');
  });
  it('after a Discord 5xx, looks for the post first because it may have been created', async () => {
    await post.setAwardChannel(channel, 'admin');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const gateway = vi.fn<typeof fetch>(async () => new Response('', { status: 502 }));
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: gateway, now })).toMatchObject({ status: 'failed', code: 'discord_http_502' });
    const found = channelWith([{ id: '100000000000000999', author: { bot: true }, content: '## 🏆 재망호 주간 시상식\n**11월 2일(월) ~ 11월 8일(일)**\n\n본문' }]);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: found, now })).toMatchObject({ status: 'posted' });
    expect(methods(found)).toEqual(['GET']);
  });
  it('after a timeout, finds the post that actually went through instead of posting twice', async () => {
    await post.setAwardChannel(channel, 'admin');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const timedOut = vi.fn<typeof fetch>(async () => { throw Object.assign(new Error('late'), { name: 'TimeoutError' }); });
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: timedOut, now })).toMatchObject({ status: 'failed', code: 'discord_timeout' });
    // Discord에는 실제로 올라가 있었다(봇 메시지, 같은 주 머리말). 다른 사람의 같은 글은 무시한다.
    const header = '## 🏆 재망호 주간 시상식\n**11월 2일(월) ~ 11월 8일(일)**';
    const recent = [
      { id: '100000000000000990', author: { bot: false }, content: `${header}\n흉내` },
      { id: '100000000000000999', author: { bot: true }, content: `${header}\n\n본문` },
    ];
    const found = channelWith(recent);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: found, now })).toEqual({ status: 'posted', week, channelId: channel });
    expect(methods(found)).toEqual(['GET']);
    expect(String(found.mock.calls[0][0])).toBe(`https://discord.com/api/v10/channels/${channel}/messages?limit=50`);
    expect((await pool.query('select status, message_id from discord_award_posts')).rows).toEqual([{ status: 'posted', message_id: '100000000000000999' }]);
  });
  it('after a timeout, posts when the channel has no such post, and waits when the lookup itself fails', async () => {
    await post.setAwardChannel(channel, 'admin');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await pool.query(`insert into discord_award_posts (week_start, channel_id, status, error_code) values ($1, $2, 'failed', 'discord_timeout')`, [week, channel]);
    const lookupDown = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }));
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: lookupDown, now })).toMatchObject({ status: 'failed', code: 'discord_lookup_http_503' });
    expect(methods(lookupDown)).toEqual(['GET']); // 확인하지 못했으면 올리지 않는다
    const empty = channelWith([{ id: '100000000000000991', author: { bot: true }, content: '다른 글' }]);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: empty, now })).toMatchObject({ status: 'posted' });
    expect(methods(empty)).toEqual(['GET', 'POST']);
  });
  it('reclaims a post stuck in posting for over 10 minutes, but not a fresh one (no double post)', async () => {
    await post.setAwardChannel(channel, 'admin');
    await pool.query(`insert into discord_award_posts (week_start, channel_id, status) values ($1, $2, 'posting')`, [week, channel]);
    const fetchFn = ok();
    const [first, second] = await Promise.all([post.postWeeklyAwards({ token: 'bot', fetchFn, now }), post.postWeeklyAwards({ token: 'bot', fetchFn, now })]);
    expect([first, second]).toEqual([{ status: 'already_posted' }, { status: 'already_posted' }]);
    expect(fetchFn).not.toHaveBeenCalled();
    await pool.query(`update discord_award_posts set updated_at = now() - interval '11 minutes'`);
    // 멈춘 시도는 실제로 올라갔을 수 있어 먼저 찾고, 없으면 올린다.
    const stuck = channelWith([]);
    expect(await post.postWeeklyAwards({ token: 'bot', fetchFn: stuck, now })).toMatchObject({ status: 'posted' });
    expect(methods(stuck)).toEqual(['GET', 'POST']);
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
