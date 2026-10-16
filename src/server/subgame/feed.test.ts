import { describe, expect, it } from 'vitest';
import type { Sql } from '../db';
import { parseThreads } from './config';
import { formatMessage, monthsToFetch, runSubgameFeed } from './feed';

const a = (key: string, game: string, title: string, status: string) =>
  `<a data-hc-title="${title}" data-hc-sub="${game}" data-hc-meta="이벤트 · 10월 1일 (목) ~ 10월 9일 (금) · ${status}" data-hc-memo-key="${key}"></a>`;
const page = [a('k1', '붕괴: 스타레일', '진행 일정', '진행중'), a('k2', '붕괴: 스타레일', '끝난 일정', '종료'), a('k3', '원신', '설정에 없는 게임', '진행중'), a('k4', '붕괴: 스타레일', '예정 일정', '예정')].join('');
const THREAD = '1560711427130392627';

// 기록 테이블을 흉내 낸 메모리 sql: insert는 이미 있으면 빈 배열, delete는 키를 지운다.
function fakeSql() {
  const keys = new Set<string>();
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join('').includes('insert into')) return keys.has(values[0] as string) ? [] : (keys.add(values[0] as string), [{ memo_key: values[0] }]);
    keys.delete(values[0] as string); return [];
  }) as Sql;
  return { sql, keys };
}

function fakeFetch(discordStatus: (n: number) => number) {
  const posts: { url: string; body: { content: string; allowed_mentions: unknown } }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://www.subgamecals.com')) return new Response(page);
    posts.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response('{}', { status: discordStatus(posts.length) });
  }) as typeof fetch;
  return { fetchFn, posts };
}

describe('외부 일정 게시', () => {
  const threads = { '붕괴: 스타레일': THREAD, '명조: 워더링 웨이브': '1560711427130392628' };
  const base = { token: 't', threads, now: new Date('2026-10-17T00:00:00Z') };

  it('설정된 게임의 진행중·예정 일정만 한 번씩 올리고 멘션은 막는다', async () => {
    const { sql, keys } = fakeSql(); const { fetchFn, posts } = fakeFetch(() => 200);
    const result = await runSubgameFeed({ ...base, sql, fetchFn });
    expect(result).toMatchObject({ status: 'ok', posted: 2, failed: [], unseenGames: ['명조: 워더링 웨이브'] });
    expect([...keys].sort()).toEqual(['k1', 'k4']);
    expect(posts.map(p => p.url)).toEqual(Array(2).fill(`https://discord.com/api/v10/channels/${THREAD}/messages`));
    expect(posts[0].body.allowed_mentions).toEqual({ parse: [] });
    // 두 번째 실행은 아무것도 올리지 않는다.
    const again = fakeFetch(() => 200);
    expect((await runSubgameFeed({ ...base, sql, fetchFn: again.fetchFn })).posted).toBe(0);
    expect(again.posts).toHaveLength(0);
  });

  it('올리기에 실패하면 기록을 지워 다음에 다시 시도하고 그 게임은 이번에 멈춘다', async () => {
    const { sql, keys } = fakeSql(); const { fetchFn, posts } = fakeFetch(() => 403);
    const result = await runSubgameFeed({ ...base, sql, fetchFn });
    expect(result).toMatchObject({ posted: 0, failed: [{ game: '붕괴: 스타레일', httpStatus: 403 }] });
    expect(keys.size).toBe(0);
    expect(posts).toHaveLength(1);
  });

  it('호출 한도(429)에 걸리면 멈추고 남은 개수를 알린다', async () => {
    const { sql, keys } = fakeSql(); const { fetchFn } = fakeFetch(n => n === 1 ? 200 : 429);
    const result = await runSubgameFeed({ ...base, sql, fetchFn });
    expect(result).toMatchObject({ status: 'rate_limited', posted: 1, pending: 1 });
    expect([...keys]).toEqual(['k1']);
  });

  it('설정이 없으면 아무것도 하지 않는다', async () => {
    const { fetchFn, posts } = fakeFetch(() => 200);
    expect((await runSubgameFeed({ ...base, threads: null, fetchFn })).status).toBe('unconfigured');
    expect(posts).toHaveLength(0);
  });

  it('메시지·조회 월·설정 형식', () => {
    expect(formatMessage({ key: 'k', game: 'g', title: '제목', kind: '이벤트', range: '10월 1일 (목)', status: '예정' }))
      .toBe('**제목**\n이벤트 · 10월 1일 (목) · 예정\n출처: <https://www.subgamecals.com/calendar>');
    expect(monthsToFetch(new Date('2026-12-31T16:00:00Z'))).toEqual(['2027-01', '2027-02']); // 한국 시간 1월 1일
    expect(parseThreads('')).toBeNull();
    expect(parseThreads(`{"원신":"${THREAD}"}`)).toEqual({ 원신: THREAD });
    expect(() => parseThreads('{"원신":"abc"}')).toThrow();
    expect(() => parseThreads('not json')).toThrow();
  });
});
