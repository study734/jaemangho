import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const WEEK = '2026-10-05'; // 한국 시간 월요일
const NOW = new Date('2026-10-12T05:00:00Z'); // 그 다음 월요일 낮(한국 시간) -> 지난주는 WEEK
const kst = (iso: string, plusSeconds = 0) => new Date(Date.parse(`${iso}+09:00`) + plusSeconds * 1000).toISOString();

describe.skipIf(!testDbUrl)('개념글·뜨거운 순간·웃음·주간 칭호 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let highlights: typeof import('./highlights');
  let awards: typeof import('./awards');
  let moments: typeof import('./moments');

  const cleanup = async () => {
    await pool.query(`delete from chat_messages where id like 'tw_%'`);
    await pool.query(`delete from chat_highlights where id like 'tw_%'`);
    await pool.query(`delete from chat_awards where week_start in ('${WEEK}', '2026-11-02')`);
    await pool.query(`delete from "user" where id like 'tw_%'`);
  };
  let n = 0;
  const msg = (author: string, at: string, o: { id?: string; channel?: string; reactions?: number; replyTo?: string; laugh?: number } = {}) =>
    pool.query(
      `insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions, top_emoji, reply_to, laugh) values ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9)`,
      [o.id ?? `tw_${++n}`, o.channel ?? 'tw_c', author, `이름${author.slice(-1).toUpperCase()}`, at, o.reactions ?? 0, o.reactions ? '🔥' : null, o.replyTo ?? null, o.laugh ?? 0]
    );

  beforeAll(async () => {
    pool = await openTestDb();
    highlights = await import('./highlights');
    awards = await import('./awards');
    moments = await import('./moments');
    await cleanup();

    // 수다: a가 한 사람 채널에서 12개
    for (let i = 0; i < 12; i++) await msg('tw_a', kst('2026-10-07T10:00:00', i * 60));
    // 새벽 3시: b가 6개
    for (let i = 0; i < 6; i++) await msg('tw_b', kst('2026-10-08T03:00:00', i * 60));
    // 떡밥: c의 메시지 T에 d가 10번 답글(답장 갤러 d)
    await msg('tw_c', kst('2026-10-09T20:00:00'), { id: 'tw_T' });
    for (let i = 0; i < 10; i++) await msg('tw_d', kst('2026-10-09T20:01:00', i * 50), { replyTo: 'tw_T' });
    // 한 방: e의 메시지 하나가 반응 12
    await msg('tw_e', kst('2026-10-10T12:00:00'), { id: 'tw_O', reactions: 12 });
    // 뜨거운 순간: 다른 채널에서 4명이 9분 안에 12개
    for (let i = 0; i < 12; i++) await msg(['tw_a', 'tw_b', 'tw_c', 'tw_d'][i % 4], kst('2026-10-09T21:00:00', i * 45), { channel: 'tw_h' });
    // 웃음: j의 말마다 직후 30초·60초에 k가 ㅋ 12개씩 두 번 (3번 반복, 서로 10분 간격)
    for (let r = 0; r < 3; r++) {
      const base = kst('2026-10-10T22:00:00', r * 600);
      await msg('tw_j', base, { channel: 'tw_l' });
      await msg('tw_k', new Date(Date.parse(base) + 30_000).toISOString(), { channel: 'tw_l', laugh: 12 });
      await msg('tw_k', new Date(Date.parse(base) + 60_000).toISOString(), { channel: 'tw_l', laugh: 12 });
    }

    await pool.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('tw_chat', '채팅한사람', 'tw_chat@t.invalid', false, now(), now()), ('tw_lurk', '눈팅이', 'tw_lurk@t.invalid', false, now(), now())`);
    await pool.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") values
      ('tw_acc1', 'tw_a', 'discord', 'tw_chat', now(), now()), ('tw_acc2', 'tw_lurk_d', 'discord', 'tw_lurk', now(), now())`);
    for (const u of ['tw_chat', 'tw_lurk'])
      await pool.query(`insert into session (id, token, "userId", "expiresAt", "createdAt", "updatedAt") values ($1, $1, $2, now() + interval '1 day', '${WEEK}T12:00:00+09:00', now())`, [`${u}_s`, u]);
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('칭호: 지난주(한국 시간 월~일) 기준으로 종류별 1명, 눈팅러는 로그인만 한 멤버', async () => {
    expect(await awards.recordAwards(NOW)).toBe(WEEK);
    const rows = (await awards.listAwards()).filter((a) => a.week === WEEK);
    const by = (t: string) => rows.filter((r) => r.title === t).map((r) => [r.authorName, r.value]);
    expect(by('talker')).toEqual([['이름A', 15]]); // 12 + 뜨거운 순간 3
    expect(by('owl')).toEqual([['이름B', 6]]);
    expect(by('magnet')).toEqual([['이름C', 10]]); // 받은 답글 10
    expect(by('oneshot')).toEqual([['이름E', 12]]); // 메시지 하나의 반응+답글
    expect(by('replier')).toEqual([['이름D', 10]]);
    expect(by('jester')).toEqual([['이름J', 72]]); // 직후 2분 안의 ㅋ: 24 x 3
    expect(by('laugher')).toEqual([['이름K', 72]]);
    expect(by('lurker')).toEqual([['눈팅이', 0]]); // tw_a는 말을 했으니 눈팅러가 아니다
    expect(rows).toHaveLength(8);
  });

  it('칭호를 다시 계산해도 중복되지 않고, 로그인한 멤버가 모은 칭호를 프로필용으로 돌려준다', async () => {
    await awards.recordAwards(NOW);
    expect((await awards.listAwards()).filter((a) => a.week === WEEK)).toHaveLength(8);
    expect(await awards.awardsForUser('tw_chat')).toEqual([{ title: 'talker', count: 1, lastWeek: WEEK }]);
    expect(await awards.awardsForUser('tw_lurk')).toEqual([{ title: 'lurker', count: 1, lastWeek: WEEK }]);
    expect(await awards.awardsForUser('tw_nobody')).toEqual([]);
  });

  it('메시지가 너무 적은 주(봇이 안 돌았던 주)는 칭호를 만들지 않는다', async () => {
    expect(await awards.recordAwards(new Date('2026-11-09T05:00:00Z'))).toBeNull();
  });

  it('뜨거운 순간: 짧은 시간에 여러 명이 몰린 구간만, 그 구간의 첫 메시지 링크로', async () => {
    const list = await moments.getHotMoments(5, NOW, 'G1');
    const mine = list.filter((m) => m.url.includes('/tw_h/'));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ messages: 12, people: 4 });
    expect(mine[0].url).toMatch(/^https:\/\/discord\.com\/channels\/G1\/tw_h\/tw_\d+$/);
    // 한 사람이 혼자 쏟아낸 구간(a의 12개, d의 답글 10개)은 순간이 아니다
    expect(list.some((m) => m.url.includes('/tw_c/'))).toBe(false);
  });

  it('웃음 유발 메시지: 직후 2분 안에 다른 사람들의 ㅋ가 많이 터진 메시지 (본인의 ㅋ는 세지 않는다)', async () => {
    const list = await moments.getFunniestMessages(5, NOW, 'G1');
    expect(list.map((f) => [f.authorName, f.laugh])).toEqual([['이름J', 24], ['이름J', 24], ['이름J', 24]]);
    expect(list[0].url).toContain('/tw_l/');
  });

  it('개념글: 반응+답글 점수 상위만 보관하고(점수 2 이상), 최신순으로 나오며, 나중에 줄어도 가장 큰 값을 유지한다', async () => {
    await highlights.recordHighlights(NOW);
    let list = await highlights.listHighlights(1, 50, 'G1');
    const mine = list.items.filter((i) => i.url.includes('/tw_c/'));
    expect(mine.map((i) => [i.authorName, i.reactions, i.replies])).toEqual([['이름E', 12, 0], ['이름C', 0, 10]]); // 최신순
    expect(mine[0].url).toBe('https://discord.com/channels/G1/tw_c/tw_O');

    // 답글이 지워지고 반응이 줄어도 개념글은 남고 큰 값을 유지한다
    await pool.query(`delete from chat_messages where reply_to = 'tw_T'`);
    await pool.query(`update chat_messages set reactions = 1 where id = 'tw_O'`);
    await highlights.recordHighlights(NOW);
    list = await highlights.listHighlights(1, 50, 'G1');
    expect(list.items.filter((i) => i.url.includes('/tw_c/')).map((i) => [i.authorName, i.reactions, i.replies])).toEqual([['이름E', 12, 0], ['이름C', 0, 10]]);

    // 페이지 나누기
    const first = await highlights.listHighlights(1, 1, 'G1');
    expect(first.items).toHaveLength(1);
    expect(first.pages).toBe(first.total);
  });
});
