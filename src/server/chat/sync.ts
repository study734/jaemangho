import { db } from '../db';
import { DiscordRateLimitedError, fetchMessagePage, findWatchedChannels } from './bot';

// 이 표시가 이름에 들어간 채널만 본다. 바꾸려면 여기를 고친다.
export const WATCH_MARK = '⛵';
const WINDOW_DAYS = 7; // 반응 수는 시간이 지나며 변하므로 최근 이 기간을 매번 다시 가져온다
const KEEP_DAYS = 60;
const MAX_PAGES = 60;

export interface SyncOptions {
  token: string;
  guildId: string;
  pageSize?: number;
  now?: Date;
  fetchFn?: typeof fetch;
}
export interface SyncResult {
  channels: number;
  messages: number;
  rateLimited: boolean;
}

export async function syncChat(o: SyncOptions): Promise<SyncResult> {
  const { token, guildId, pageSize = 100, now = new Date(), fetchFn = fetch } = o;
  const cutoff = now.getTime() - WINDOW_DAYS * 86_400_000;
  const channels = await findWatchedChannels(guildId, WATCH_MARK, token, fetchFn);
  const sql = await db();
  let total = 0;
  let rateLimited = false;

  for (const channel of channels) {
    let before: string | undefined;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { messages, rawCount, oldestId } = await fetchMessagePage(channel.id, token, { before, limit: pageSize }, fetchFn);
        const recent = messages.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
        if (recent.length) {
          await sql`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions, top_emoji)
            select * from unnest(${recent.map((m) => m.id)}::text[], ${recent.map(() => channel.id)}::text[], ${recent.map((m) => m.authorId)}::text[],
              ${recent.map((m) => m.authorName)}::text[], ${recent.map((m) => m.createdAt)}::timestamptz[], ${recent.map((m) => m.reactions)}::int[], ${recent.map((m) => m.topEmoji)}::text[])
            on conflict (id) do update set reactions = excluded.reactions, top_emoji = excluded.top_emoji, author_name = excluded.author_name, updated_at = now()`;
          total += recent.length;
        }
        // 마지막 페이지이거나, 이 페이지의 가장 오래된 메시지가 기간 밖이면 끝
        const oldest = messages.at(-1);
        if (rawCount < pageSize || !oldestId || (oldest && new Date(oldest.createdAt).getTime() < cutoff)) break;
        before = oldestId;
      }
    } catch (e) {
      if (!(e instanceof DiscordRateLimitedError)) throw e;
      rateLimited = true; // 가져온 페이지는 이미 저장했다. 다음 실행이 이어서 채운다.
    }
  }

  await sql`delete from chat_messages where created_at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()}`;
  return { channels: channels.length, messages: total, rateLimited };
}
