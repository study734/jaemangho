import { db } from '../db';
import { recordAwards } from './awards';
import { DiscordRateLimitedError, fetchMessagePage, findWatchedChannels } from './bot';
import { recordHighlights } from './highlights';

// 이 표시가 이름에 들어간 채널만 본다. 바꾸려면 여기를 고친다.
export const WATCH_MARK = '⛵';
const MAX_DAYS = 8; // 처음 채우거나 크론이 오래 빠졌을 때 거슬러 올라가는 최대 기간(지난주 월~일을 월요일 새벽에도 덮도록 7일보다 하루 길게)
const REFRESH_DAYS = 3; // 평소에는 최근 이 기간만 다시 가져온다(반응·답글은 보통 이 안에 정해진다)
const KEEP_DAYS = 60;
const MAX_PAGES = 60;

// 이번 실행이 어디까지 거슬러 올라갈지. 이미 저장된 기록이 있으면 평소엔 최근 REFRESH_DAYS만 새로고침하고,
// 크론이 빠져 빈 구간이 생겼으면(가장 최근 저장 시각이 더 오래됐으면) 그 하루 전부터 다시 받는다. 처음이면 MAX_DAYS.
export function syncCutoff(now: Date, latestStored: Date | null): number {
  const day = 86_400_000;
  const floor = now.getTime() - MAX_DAYS * day;
  if (!latestStored) return floor;
  return Math.max(floor, Math.min(now.getTime() - REFRESH_DAYS * day, latestStored.getTime() - day));
}

export interface SyncOptions {
  token: string;
  guildId: string;
  pageSize?: number;
  now?: Date;
  fetchFn?: typeof fetch;
  laugh?: boolean; // 웃음 분석(ㅋ 개수). 기본 꺼짐: 메시지 내용 권한과 CHAT_LAUGH=1을 둘 다 켰을 때만 쓴다
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number; // 이 시간 안에 끝낸다(함수 실행 제한보다 짧게). 한도 때문에 기다리는 시간도 포함
}
export interface SyncResult {
  channels: number;
  messages: number;
  rateLimited: boolean;
  warnings?: string[];
  truncated?: boolean;
}

export async function syncChat(o: SyncOptions): Promise<SyncResult> {
  const { token, guildId, pageSize = 100, now = new Date(), fetchFn = fetch, laugh = false, sleep, budgetMs = 50_000 } = o;
  const net = { fetchFn, sleep, deadline: Date.now() + budgetMs };
  const channels = await findWatchedChannels(guildId, WATCH_MARK, token, net);
  const sql = await db();
  const [latest] = await sql`select max(created_at) as at from chat_messages`;
  const cutoff = syncCutoff(now, latest?.at ? new Date(latest.at as string | Date) : null);
  let total = 0;
  let rateLimited = false;
  let truncated = false;

  for (const channel of channels) {
    let before: string | undefined;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { messages, rawCount, oldestId } = await fetchMessagePage(channel.id, token, { before, limit: pageSize, laugh }, net);
        const recent = messages.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
        if (recent.length) {
          await sql`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions, top_emoji, reply_to, laugh)
            select * from unnest(${recent.map((m) => m.id)}::text[], ${recent.map(() => channel.id)}::text[], ${recent.map((m) => m.authorId)}::text[],
              ${recent.map((m) => m.authorName)}::text[], ${recent.map((m) => m.createdAt)}::timestamptz[], ${recent.map((m) => m.reactions)}::int[], ${recent.map((m) => m.topEmoji)}::text[],
              ${recent.map((m) => m.replyTo)}::text[], ${recent.map((m) => m.laugh)}::int[])
            on conflict (id) do update set reactions = excluded.reactions, top_emoji = excluded.top_emoji, author_name = excluded.author_name,
              reply_to = excluded.reply_to, laugh = case when ${laugh}::boolean then excluded.laugh else chat_messages.laugh end, updated_at = now()`;
          total += recent.length;
        }
        // 마지막 페이지이거나, 이 페이지의 가장 오래된 메시지가 기간 밖이면 끝
        const oldest = messages.at(-1);
        if (rawCount < pageSize || !oldestId || (oldest && new Date(oldest.createdAt).getTime() < cutoff)) break;
        if (page === MAX_PAGES - 1) truncated = true;
        before = oldestId;
      }
    } catch (e) {
      if (!(e instanceof DiscordRateLimitedError)) throw e;
      // 기다려도 안 풀리거나 기한이 다 됐다. 가져온 페이지는 저장했지만 다음 실행도 최신부터 다시 시작하므로,
      // 더 오래된 메시지는 채워지지 않을 수 있다(rateLimited로 알린다).
      rateLimited = true;
    }
  }

  // 개념글 보관함과 지난주 칭호를 갱신한다. 실패해도 동기화 결과는 돌려준다.
  const warnings: string[] = [];
  await recordHighlights(now).catch((e) => { warnings.push('highlights_failed'); console.error('record highlights failed', e); });
  await recordAwards(now).catch((e) => { warnings.push('awards_failed'); console.error('record awards failed', e); });

  await sql`delete from chat_messages where created_at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()}`;
  return { channels: channels.length, messages: total, rateLimited, ...(warnings.length ? { warnings } : {}), ...(truncated ? { truncated } : {}) };
}
