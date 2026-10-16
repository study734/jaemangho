import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calendarTag } from './test-html';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('외부 일정 게시 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let feed: typeof import('./feed');
  const THREAD = '1560711427130392627';
  const html = calendarTag({ key: 'it_k1', game: '테스트게임', title: '동시 일정', meta: '이벤트 · 10월 1일 (목) · 진행중' });
  const cleanup = () => pool.query(`delete from subgame_posts where memo_key like 'it_%'`);

  beforeAll(async () => { pool = await openTestDb(); feed = await import('./feed'); await cleanup(); });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('동시에 두 번 실행해도 같은 일정은 한 번만 올라간다', async () => {
    let posts = 0;
    const fetchFn = (async (url: string) => {
      if (url.startsWith('https://www.subgamecals.com')) return new Response(html);
      posts++; return new Response('{}');
    }) as typeof fetch;
    const run = () => feed.runSubgameFeed({ token: 't', threads: { 테스트게임: THREAD }, fetchFn });
    await Promise.all([run(), run()]);
    expect(posts).toBe(1);
    expect((await pool.query(`select count(*)::int as n from subgame_posts where memo_key = 'it_k1'`)).rows[0].n).toBe(1);
  });
});
