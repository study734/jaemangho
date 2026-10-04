import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

const WEEK = '2026-10-05'; // 한국 시간 월요일
const NOW = new Date('2026-10-12T05:00:00Z'); // 그 다음 월요일 낮(한국 시간) -> 지난주는 WEEK

describe.skipIf(!testDbUrl)('개념글 보관함·주간 칭호 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let highlights: typeof import('./highlights');
  let awards: typeof import('./awards');

  const cleanup = async () => {
    await pool.query(`delete from chat_messages where id like 'tw_%'`);
    await pool.query(`delete from chat_highlights where id like 'tw_%'`);
    await pool.query(`delete from chat_awards where week_start in ('${WEEK}', '2026-11-02')`);
    await pool.query(`delete from "user" where id like 'tw_%'`);
  };
  // 메시지를 직접 심는다. at은 한국 시간 문자열.
  let n = 0;
  const msg = (author: string, name: string, kst: string, reactions = 0) =>
    pool.query(
      `insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions, top_emoji) values ($1, 'tw_c', $2, $3, $4::timestamptz, $5, $6)`,
      [`tw_${++n}`, author, name, `${kst}+09:00`, reactions, reactions ? '🔥' : null]
    );

  beforeAll(async () => {
    pool = await openTestDb();
    highlights = await import('./highlights');
    awards = await import('./awards');
    await cleanup();

    for (let i = 0; i < 12; i++) await msg('tw_a', '이름A', `2026-10-07T1${i % 10}:00:00`); // 수다: 12개
    for (let i = 0; i < 6; i++) await msg('tw_b', '이름B', `2026-10-08T03:0${i}:00`); // 새벽 3시: 6개
    for (const r of [4, 3, 2]) await msg('tw_c', '이름C', '2026-10-09T20:00:00', r); // 인기: 합 9
    await msg('tw_d', '이름D', '2026-10-09T21:00:00', 7); // 한 방: 7 (개념글)
    await msg('tw_x', '다른주', '2026-09-30T12:00:00', 9); // 지난주 밖(개념글 기준은 넘김)

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

  it('개념글: 기준 이상 반응만 보관하고, 반응이 줄어도 가장 큰 값을 유지하며, 링크와 함께 최신순으로 나온다', async () => {
    await highlights.recordHighlights();
    let list = await highlights.listHighlights(1, 50, 'G1');
    const mine = list.items.filter((i) => i.url.includes('/tw_c/tw_'));
    expect(mine.map((i) => [i.reactions, i.topEmoji])).toEqual([[7, '🔥'], [9, '🔥']]); // 최신순: D(10/9), X(9/30)
    expect(mine[0].url).toMatch(/^https:\/\/discord\.com\/channels\/G1\/tw_c\/tw_\d+$/);

    // 반응이 지워져도 개념글은 남고 큰 값을 유지한다
    await pool.query(`update chat_messages set reactions = 1 where author_id = 'tw_d'`);
    await highlights.recordHighlights();
    list = await highlights.listHighlights(1, 50, 'G1');
    expect(list.items.find((i) => i.authorName === '이름D')?.reactions).toBe(7);

    // 페이지 나누기
    const first = await highlights.listHighlights(1, 1, 'G1');
    expect(first.items).toHaveLength(1);
    expect(first.pages).toBe(first.total);
    await pool.query(`update chat_messages set reactions = 7 where author_id = 'tw_d'`);
  });

  it('칭호: 지난주(한국 시간 월~일) 기준으로 종류별 1명, 눈팅러는 로그인만 한 멤버', async () => {
    expect(await awards.recordAwards(NOW)).toBe(WEEK);
    const rows = (await awards.listAwards()).filter((a) => a.week === WEEK);
    const by = (t: string) => rows.filter((r) => r.title === t).map((r) => [r.authorName, r.value]);
    expect(by('talker')).toEqual([['이름A', 12]]);
    expect(by('owl')).toEqual([['이름B', 6]]);
    expect(by('popular')).toEqual([['이름C', 9]]);
    expect(by('oneshot')).toEqual([['이름D', 7]]);
    expect(by('lurker')).toEqual([['눈팅이', 0]]); // 채팅한사람(tw_a)은 말을 했으니 눈팅러가 아니다
    // 지난주 밖 메시지(9/30)는 세지 않는다: 이름 다른주 는 칭호가 없다
    expect(rows.some((r) => r.authorName === '다른주')).toBe(false);
  });

  it('칭호를 다시 계산해도 중복되지 않고, 로그인한 멤버가 모은 칭호를 프로필용으로 돌려준다', async () => {
    await awards.recordAwards(NOW);
    expect((await awards.listAwards()).filter((a) => a.week === WEEK)).toHaveLength(5);
    expect(await awards.awardsForUser('tw_chat')).toEqual([{ title: 'talker', count: 1, lastWeek: WEEK }]);
    expect(await awards.awardsForUser('tw_lurk')).toEqual([{ title: 'lurker', count: 1, lastWeek: WEEK }]);
    expect(await awards.awardsForUser('tw_nobody')).toEqual([]);
  });

  it('메시지가 너무 적은 주(봇이 안 돌았던 주)는 칭호를 만들지 않는다', async () => {
    expect(await awards.recordAwards(new Date('2026-11-09T05:00:00Z'))).toBeNull();
  });
});
