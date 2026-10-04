import { db } from '../db';
import { recordAwards } from './awards';
import { DiscordRateLimitedError, fetchMessagePage, findWatchedChannels } from './bot';
import { recordHighlights } from './highlights';

// 이 표시가 이름에 들어간 채널만 본다. 바꾸려면 여기를 고친다.
export const WATCH_MARK = '⛵';
const WINDOW_DAYS = 8; // 반응 수는 시간이 지나며 변하므로 최근 이 기간을 매번 다시 가져온다. 지난주(월~일)를 월요일 새벽에도 빠짐없이 덮도록 7일보다 하루 길게
const KEEP_DAYS = 60;
const MAX_PAGES = 60;

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
}

export async function syncChat(o: SyncOptions): Promise<SyncResult> {
  const { token, guildId, pageSize = 100, now = new Date(), fetchFn = fetch, laugh = false, sleep, budgetMs = 50_000 } = o;
  const net = { fetchFn, sleep, deadline: Date.now() + budgetMs };
  const cutoff = now.getTime() - WINDOW_DAYS * 86_400_000;
  const channels = await findWatchedChannels(guildId, WATCH_MARK, token, net);
  const sql = await db();
  let total = 0;
  let rateLimited = false;

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
  await recordHighlights(now).catch((e) => console.error('record highlights failed', e));
  await recordAwards(now).catch((e) => console.error('record awards failed', e));

  await sql`delete from chat_messages where created_at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()}`;
  return { channels: channels.length, messages: total, rateLimited };
}
