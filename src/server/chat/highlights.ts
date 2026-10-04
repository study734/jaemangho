import { db } from '../db';

// 개념글: 최근 8일 중 "반응 수 + 받은 답글 수"가 가장 큰 메시지 상위 HIGHLIGHT_TOP개(점수 MIN_SCORE 이상)가 보관함에 들어간다.
// 절대 기준 대신 순위를 쓰므로, 반응이나 답글을 적게 쓰는 방에서도 비어 있지 않다. 점수의 비중은 아래 SQL에서 조정한다.
export const HIGHLIGHT_TOP = 5;
export const HIGHLIGHT_MIN_SCORE = 2;

// 한 번 들어가면 남고, 반응·답글 수는 지금까지 본 가장 큰 값을 유지한다.
export async function recordHighlights(now = new Date()) {
  const sql = await db();
  await sql`with scored as (
      select m.id, m.channel_id, m.author_id, m.author_name, m.created_at, m.reactions, m.top_emoji,
             (select count(*) from chat_messages r where r.reply_to = m.id and r.author_id <> m.author_id)::int as replies
      from chat_messages m where m.created_at > ${now.toISOString()}::timestamptz - interval '8 days')
    insert into chat_highlights (id, channel_id, author_id, author_name, created_at, reactions, replies, top_emoji)
    select id, channel_id, author_id, author_name, created_at, reactions, replies, top_emoji from scored
    where reactions + replies >= ${HIGHLIGHT_MIN_SCORE} order by reactions + replies desc, created_at desc limit ${HIGHLIGHT_TOP}
    on conflict (id) do update set reactions = greatest(chat_highlights.reactions, excluded.reactions),
      replies = greatest(chat_highlights.replies, excluded.replies), top_emoji = excluded.top_emoji, author_name = excluded.author_name`;
}

export interface HighlightItem {
  url: string;
  authorName: string;
  authorUserId: string | null;
  reactions: number;
  replies: number;
  topEmoji: string | null;
  at: string;
}

export async function listHighlights(page = 1, pageSize = 30, guildId = process.env.DISCORD_GUILD_ID ?? ''): Promise<{ items: HighlightItem[]; total: number; pages: number }> {
  const sql = await db();
  const offset = (Math.max(1, page) - 1) * pageSize;
  const [count, rows] = await Promise.all([
    sql`select count(*)::int as n from chat_highlights`,
    sql`select h.id, h.channel_id as "channelId", h.author_name as "authorName", h.reactions, h.replies, h.top_emoji as "topEmoji", h.created_at as at, a."userId" as "userId"
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
      replies: r.replies as number,
      topEmoji: (r.topEmoji as string | null) ?? null,
      at: new Date(r.at as string | Date).toISOString(),
    })),
  };
}
