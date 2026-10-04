import { db } from '../db';

export interface Highlight {
  url: string;
  authorName: string;
  authorUserId: string | null; // 우리 앱에 로그인한 멤버면 프로필 id
  reactions: number;
  replies: number;
  topEmoji: string | null;
  at: string;
}
export interface Talker {
  name: string;
  userId: string | null;
  count: number;
}
export interface ChatHighlights {
  total: number;
  hallOfFame: Highlight[];
  talkers: Talker[];
  peakHour: number | null; // 한국 시간 기준 가장 메시지가 많은 시(0~23)
}

// 최근 7일. 데이터가 없으면(봇 미설정 등) null.
export async function getChatHighlights(guildId = process.env.DISCORD_GUILD_ID ?? ''): Promise<ChatHighlights | null> {
  const sql = await db();
  const [summary, fame, talkers, hours] = await Promise.all([
    sql`select count(*)::int as total from chat_messages where created_at > now() - interval '7 days'`,
    sql`select * from (
          select m.id, m.channel_id as "channelId", m.author_name as "authorName", m.reactions, m.top_emoji as "topEmoji", m.created_at as at, a."userId" as "userId",
                 (select count(*) from chat_messages r where r.reply_to = m.id and r.author_id <> m.author_id)::int as replies
          from chat_messages m left join account a on a."accountId" = m.author_id and a."providerId" = 'discord'
          where m.created_at > now() - interval '7 days') x
        where reactions + replies >= 2 order by reactions + replies desc, at desc limit 5`,
    sql`select max(m.author_name) as name, a."userId" as "userId", count(*)::int as count
        from chat_messages m left join account a on a."accountId" = m.author_id and a."providerId" = 'discord'
        where m.created_at > now() - interval '7 days'
        group by m.author_id, a."userId" order by count desc, name limit 5`,
    sql`select extract(hour from created_at at time zone 'Asia/Seoul')::int as hour, count(*)::int as count
        from chat_messages where created_at > now() - interval '7 days' group by 1 order by count desc, hour limit 1`,
  ]);
  const total = (summary[0]?.total as number) ?? 0;
  if (total === 0) return null;
  return {
    total,
    hallOfFame: fame.map((r) => ({
      url: `https://discord.com/channels/${guildId}/${r.channelId}/${r.id}`,
      authorName: r.authorName as string,
      authorUserId: (r.userId as string | null) ?? null,
      reactions: r.reactions as number,
      replies: r.replies as number,
      topEmoji: (r.topEmoji as string | null) ?? null,
      at: new Date(r.at as string | Date).toISOString(),
    })),
    talkers: talkers.map((r) => ({ name: r.name as string, userId: (r.userId as string | null) ?? null, count: r.count as number })),
    peakHour: (hours[0]?.hour as number | undefined) ?? null,
  };
}
