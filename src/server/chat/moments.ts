import { db } from '../db';

export interface HotMoment {
  url: string; // 그 순간의 첫 메시지
  at: string;
  messages: number;
  people: number;
}
export interface FunnyMessage {
  url: string;
  authorName: string;
  at: string;
  laugh: number;
}

const link = (guildId: string, channelId: unknown, id: unknown) => `https://discord.com/channels/${guildId}/${channelId}/${id}`;

// 대화가 폭발한 순간: 10분 동안 3명 이상이 10개 이상 말한 구간. 같은 날에는 가장 뜨거웠던 구간 하나만. 내용 없이 메시지 수와 사람 수만 쓴다.
export async function getHotMoments(limit = 5, now = new Date(), guildId = process.env.DISCORD_GUILD_ID ?? ''): Promise<HotMoment[]> {
  const sql = await db();
  const rows = await sql`with b as (
      select date_bin('10 minutes', created_at, timestamptz '2000-01-01') as t, channel_id, count(*)::int as n, count(distinct author_id)::int as people,
             (array_agg(id order by created_at))[1] as first_id, min(created_at) as at
      from chat_messages where created_at > ${now.toISOString()}::timestamptz - interval '8 days' group by 1, 2)
    select distinct on (day) channel_id as "channelId", first_id as "firstId", n, people, at
    from (select *, (t at time zone 'Asia/Seoul')::date as day from b where people >= 3 and n >= 10) x order by day, n desc`;
  return rows
    .map((r) => ({ url: link(guildId, r.channelId, r.firstId), at: new Date(r.at as string | Date).toISOString(), messages: r.n as number, people: r.people as number }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, limit);
}

// 웃음 유발 메시지: 그 메시지 직후 2분 안에 다른 사람들이 보낸 ㅋ가 가장 많은 메시지. 웃음 분석을 켰을 때만 데이터가 있다(아니면 빈 목록).
export async function getFunniestMessages(limit = 5, now = new Date(), guildId = process.env.DISCORD_GUILD_ID ?? ''): Promise<FunnyMessage[]> {
  const sql = await db();
  const rows = await sql`select m.id, m.channel_id as "channelId", m.author_name as "authorName", m.created_at as at, l.s as laugh
    from chat_messages m
    cross join lateral (select coalesce(sum(o.laugh), 0)::int as s from chat_messages o
      where o.channel_id = m.channel_id and o.author_id <> m.author_id and o.created_at > m.created_at and o.created_at <= m.created_at + interval '2 minutes') l
    where m.created_at > ${now.toISOString()}::timestamptz - interval '8 days' and l.s >= 20
    order by l.s desc, m.created_at desc limit ${limit}`;
  return rows.map((r) => ({ url: link(guildId, r.channelId, r.id), authorName: r.authorName as string, at: new Date(r.at as string | Date).toISOString(), laugh: r.laugh as number }));
}
