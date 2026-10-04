import { db } from '../db';

// 반응이 이 개수 이상이면 개념글. 홈에 너무 많거나 적게 뜨면 여기를 조정한다.
export const HIGHLIGHT_MIN_REACTIONS = 5;

// 동기화된 메시지 중 개념글 기준을 넘은 것을 보관함에 넣는다. 한 번 들어가면 남고, 반응 수는 가장 큰 값을 유지한다.
export async function recordHighlights() {
  const sql = await db();
  await sql`insert into chat_highlights (id, channel_id, author_id, author_name, created_at, reactions, top_emoji)
    select id, channel_id, author_id, author_name, created_at, reactions, top_emoji from chat_messages where reactions >= ${HIGHLIGHT_MIN_REACTIONS}
    on conflict (id) do update set reactions = greatest(chat_highlights.reactions, excluded.reactions),
      top_emoji = excluded.top_emoji, author_name = excluded.author_name`;
}

export interface HighlightItem {
  url: string;
  authorName: string;
  authorUserId: string | null;
  reactions: number;
  topEmoji: string | null;
  at: string;
}

export async function listHighlights(page = 1, pageSize = 30, guildId = process.env.DISCORD_GUILD_ID ?? ''): Promise<{ items: HighlightItem[]; total: number; pages: number }> {
  const sql = await db();
  const offset = (Math.max(1, page) - 1) * pageSize;
  const [count, rows] = await Promise.all([
    sql`select count(*)::int as n from chat_highlights`,
    sql`select h.id, h.channel_id as "channelId", h.author_name as "authorName", h.reactions, h.top_emoji as "topEmoji", h.created_at as at, a."userId" as "userId"
        from chat_highlights h left join account a on a."accountId" = h.author_id and a."providerId" = 'discord'
        order by h.created_at desc limit ${pageSize} offset ${offset}`,
  ]);
  const total = (count[0]?.n as number) ?? 0;
  return {
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((r) => ({
      url: `https://discord.com/channels/${guildId}/${r.channelId}/${r.id}`,
      authorName: r.authorName as string,
      authorUserId: (r.userId as string | null) ?? null,
      reactions: r.reactions as number,
      topEmoji: (r.topEmoji as string | null) ?? null,
      at: new Date(r.at as string | Date).toISOString(),
    })),
  };
}
