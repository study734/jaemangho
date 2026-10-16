import { db, type Sql } from '../db';
import { parseThreads } from './config';
import { CALENDAR_URL, fetchCalendar, type CalendarEvent } from './calendar';

const DISCORD = 'https://discord.com/api/v10';
const MAX_POSTS_PER_RUN = 15; // 처음 켤 때 한꺼번에 쏟아내지 않고 남은 것은 다음 실행에서 올린다.

export function formatMessage(e: CalendarEvent) {
  return `**${e.title.slice(0, 300)}**\n${e.kind} · ${e.range} · ${e.status}\n출처: <${CALENDAR_URL}>`;
}

// 한국 시간 기준 이번 달과 다음 달(월 경계의 예정 일정을 놓치지 않게).
export function monthsToFetch(now: Date) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const month = (offset: number) => { const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + offset, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  return [month(0), month(1)];
}

export interface FeedDeps {
  token: string;
  threads: Record<string, string> | null;
  sql?: Sql;
  fetchFn?: typeof fetch;
  now?: Date;
}
export interface FeedResult {
  status: 'unconfigured' | 'ok' | 'rate_limited';
  posted: number; pending: number;
  failed: { game: string; httpStatus: number }[];
  unseenGames: string[]; // 설정에는 있지만 이번 일정표에 나오지 않은 게임(이름이 바뀌었는지 확인)
  skipped: number;
}

// 올리기 전에 기록부터 남겨(memo_key 기본키) 동시에 실행돼도 한 번만 올라가게 하고, 올리기에 실패하면 기록을 지워 다음에 다시 시도한다.
export async function runSubgameFeed({ token, threads, sql, fetchFn = fetch, now = new Date() }: FeedDeps): Promise<FeedResult> {
  const result: FeedResult = { status: 'ok', posted: 0, pending: 0, failed: [], unseenGames: [], skipped: 0 };
  if (!threads || !Object.keys(threads).length) return { ...result, status: 'unconfigured' };
  const query = sql ?? await db();

  const events = new Map<string, CalendarEvent>();
  for (const month of monthsToFetch(now)) {
    const page = await fetchCalendar(month, fetchFn);
    result.skipped += page.skipped;
    for (const e of page.events) events.set(e.key, e);
  }
  const seen = new Set([...events.values()].map(e => e.game));
  result.unseenGames = Object.keys(threads).filter(game => !seen.has(game));

  const wanted = [...events.values()].filter(e => e.status !== '종료' && threads[e.game]);
  const failedGames = new Set<string>();
  for (const e of wanted) {
    if (failedGames.has(e.game)) continue;
    if (result.posted >= MAX_POSTS_PER_RUN) { result.pending++; continue; }
    const claimed = await query`insert into subgame_posts (memo_key, game, thread_id) values (${e.key}, ${e.game}, ${threads[e.game]})
      on conflict do nothing returning memo_key`;
    if (!claimed.length) continue;
    const res = await fetchFn(`${DISCORD}/channels/${threads[e.game]}/messages`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: formatMessage(e), allowed_mentions: { parse: [] }, flags: 4 }),
    }).catch(() => null);
    if (res?.ok) { result.posted++; continue; }
    await query`delete from subgame_posts where memo_key = ${e.key}`;
    if (res?.status === 429) { result.status = 'rate_limited'; result.pending += wanted.length - result.posted; break; }
    result.failed.push({ game: e.game, httpStatus: res?.status ?? 0 });
    failedGames.add(e.game);
  }
  return result;
}

export const runSubgameFeedFromEnv = () => runSubgameFeed({ token: process.env.DISCORD_BOT_TOKEN ?? '', threads: parseThreads(process.env.SUBGAME_THREADS) });
