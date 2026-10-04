import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

describe.skipIf(!testDbUrl)('채팅 하이라이트 동기화·집계 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let sync: typeof import('./sync');
  let stats: typeof import('./stats');

  const cleanup = async () => {
    await pool.query(`delete from chat_messages where id like 'tcm_%'`);
    await pool.query(`delete from chat_highlights where id like 'tcm_%'`); // 동기화가 개념글 보관함에도 넣는다
    await pool.query(`delete from "user" where id like 'tcm_%'`);
  };
  const msg = (id: string, days: number, author: string, reactions: { count: number; emoji: string }[] = []) => ({
    id,
    type: 0,
    timestamp: ago(days),
    author: { id: author, username: author, global_name: `이름_${author}` },
    reactions: reactions.map((r) => ({ count: r.count, emoji: { id: null, name: r.emoji } })),
  });
  // 길드 채널 목록과 채널의 메시지(최신순, before로 이어 받기)를 흉내 낸다
  const discord = (messages: ReturnType<typeof msg>[], opts: { rateLimitAfterFirstPage?: boolean; rateLimitOnce?: boolean } = {}) => {
    let limitedOnce = false;
    return vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/guilds/')) return new Response(JSON.stringify([{ id: 'tcm_c1', name: '⛵｜잡담', type: 0 }, { id: 'tcm_c2', name: '공지', type: 0 }]));
      const before = new URL(u).searchParams.get('before');
      if (before && opts.rateLimitAfterFirstPage) return new Response('{}', { status: 429 });
      if (before && opts.rateLimitOnce && !limitedOnce) {
        limitedOnce = true;
        return new Response(JSON.stringify({ retry_after: 0.1 }), { status: 429 });
      }
      const limit = Number(new URL(u).searchParams.get('limit'));
      const start = before ? messages.findIndex((m) => m.id === before) + 1 : 0;
      return new Response(JSON.stringify(messages.slice(start, start + limit)));
    }) as unknown as typeof fetch;
  };

  beforeAll(async () => {
    pool = await openTestDb();
    sync = await import('./sync');
    stats = await import('./stats');
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  const sleeps: number[] = [];
  const opts = (fetchFn: typeof fetch) => ({ token: 't'.repeat(40), guildId: 'G1', pageSize: 2, fetchFn, sleep: async (ms: number) => void sleeps.push(ms) });
  const ids = async () => (await pool.query(`select id from chat_messages where id like 'tcm_%' order by id`)).rows.map((r) => r.id);

  it('이름에 ⛵가 있는 채널만 보고, 7일 안의 메시지를 페이지를 넘기며 저장한다 (기간 밖은 저장하지 않는다)', async () => {
    const fetchFn = discord([
      msg('tcm_5', 0.1, 'tcm_a1', [{ count: 5, emoji: '😂' }, { count: 1, emoji: '👍' }]),
      msg('tcm_4', 1, 'tcm_a2', [{ count: 2, emoji: '👍' }]),
      msg('tcm_3', 2, 'tcm_a1'),
      msg('tcm_2', 3, 'tcm_a1', [{ count: 1, emoji: '❤️' }]),
      msg('tcm_1', 30, 'tcm_a2', [{ count: 99, emoji: '🔥' }]), // 기간 밖
    ]);
    const result = await sync.syncChat(opts(fetchFn));
    expect(result).toEqual({ channels: 1, messages: 4, rateLimited: false });
    expect(await ids()).toEqual(['tcm_2', 'tcm_3', 'tcm_4', 'tcm_5']);
    const row = (await pool.query(`select channel_id, author_name, reactions, top_emoji from chat_messages where id = 'tcm_5'`)).rows[0];
    expect(row).toEqual({ channel_id: 'tcm_c1', author_name: '이름_tcm_a1', reactions: 6, top_emoji: '😂' });
  });

  it('다시 실행하면 중복 없이 반응 수만 갱신된다', async () => {
    await sync.syncChat(opts(discord([msg('tcm_5', 0.1, 'tcm_a1', [{ count: 9, emoji: '😂' }]), msg('tcm_4', 1, 'tcm_a2')])));
    expect(await ids()).toEqual(['tcm_2', 'tcm_3', 'tcm_4', 'tcm_5']);
    expect((await pool.query(`select reactions from chat_messages where id = 'tcm_5'`)).rows[0].reactions).toBe(9);
    expect((await pool.query(`select reactions from chat_messages where id = 'tcm_4'`)).rows[0].reactions).toBe(0);
  });

  it('한 번 429를 받아도 기다렸다가 이어서 끝까지 가져온다 (rateLimited 아님)', async () => {
    await pool.query(`delete from chat_messages where id like 'tcm_%'`);
    sleeps.length = 0;
    const result = await sync.syncChat(
      opts(discord([msg('tcm_5', 0.1, 'tcm_a1'), msg('tcm_4', 1, 'tcm_a1'), msg('tcm_3', 2, 'tcm_a1'), msg('tcm_2', 3, 'tcm_a1')], { rateLimitOnce: true }))
    );
    expect(result).toEqual({ channels: 1, messages: 4, rateLimited: false });
    expect(sleeps).toEqual([150]); // retry_after 0.1초 + 여유 50ms
    expect(await ids()).toEqual(['tcm_2', 'tcm_3', 'tcm_4', 'tcm_5']);
  });

  it('기다려도 계속 429면 이미 받은 페이지는 남기고 rateLimited로 알린다', async () => {
    await pool.query(`delete from chat_messages where id like 'tcm_%'`);
    const result = await sync.syncChat(
      opts(discord([msg('tcm_5', 0.1, 'tcm_a1'), msg('tcm_4', 1, 'tcm_a1'), msg('tcm_3', 2, 'tcm_a1')], { rateLimitAfterFirstPage: true }))
    );
    expect(result).toEqual({ channels: 1, messages: 2, rateLimited: true });
    expect(await ids()).toEqual(['tcm_4', 'tcm_5']);
  });

  it('60일이 지난 기록은 지운다', async () => {
    await pool.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at) values ('tcm_old', 'tcm_c1', 'x', 'x', now() - interval '61 days')`);
    await sync.syncChat(opts(discord([])));
    expect(await ids()).not.toContain('tcm_old');
  });

  it('집계: 명예의 전당은 반응 많은 순, 수다 통계는 메시지 수 순, 로그인한 멤버는 프로필 id가 붙는다', async () => {
    await pool.query(`delete from chat_messages where id like 'tcm_%'`);
    await pool.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('tcm_u1', '집계철수', 'tcm_u1@test.invalid', false, now(), now())`);
    await pool.query(
      `insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") values ('tcm_acc', 'tcm_a1', 'discord', 'tcm_u1', now(), now())`
    );
    await sync.syncChat(
      opts(discord([
        msg('tcm_5', 0.1, 'tcm_a1', [{ count: 3, emoji: '😂' }]),
        msg('tcm_4', 1, 'tcm_a2', [{ count: 8, emoji: '🔥' }]),
        msg('tcm_3', 2, 'tcm_a1'),
      ]))
    );
    const h = await stats.getChatHighlights('G1');
    expect(h).not.toBeNull();
    const mine = (h?.hallOfFame ?? []).filter((x) => x.url.includes('tcm_c1'));
    expect(mine.map((x) => [x.url.split('/').at(-1), x.reactions, x.topEmoji])).toEqual([['tcm_4', 8, '🔥'], ['tcm_5', 3, '😂']]);
    expect(mine[0].url).toBe('https://discord.com/channels/G1/tcm_c1/tcm_4');
    expect(mine[1].authorUserId).toBe('tcm_u1');
    expect(mine[0].authorUserId).toBeNull();
    const talker = h?.talkers.find((t) => t.name === '이름_tcm_a1');
    expect(talker).toMatchObject({ count: 2, userId: 'tcm_u1' });
  });
});
