import { db } from './db';
import type { HotMoment } from './chat/moments';
import type { DiscoveryPerson } from '../lib/discovery';

export interface DiscoveryMoment extends HotMoment {
  baseline: number | null;
  baselineSamples: number;
  participants: DiscoveryPerson[];
}

// 기존 메시지 메타데이터만 사용한다. 본문·대화 주제를 해석하지 않는다.
export async function contextualizeMoments(moments: HotMoment[]): Promise<DiscoveryMoment[]> {
  if (!moments.length) return [];
  const sql = await db();
  const selected = moments.map(m => ({ url: m.url, at: m.at, channel: m.url.split('/')[5] }));
  const rows = await sql`with selected as (
      select * from jsonb_to_recordset(${JSON.stringify(selected)}::jsonb) as s(url text, at timestamptz, channel text)
    ), bins as (
      select channel_id, date_bin('10 minutes', created_at, timestamptz '2000-01-01') as t,
             count(*)::int as n, count(distinct author_id)::int as people
      from chat_messages
      where created_at >= (select min(at) from selected) - interval '7 days'
        and created_at < (select max(at) from selected) + interval '10 minutes'
      group by 1, 2
    )
    select s.url, b.baseline, b.samples, p.participants
    from selected s
    cross join lateral (
      select percentile_cont(0.5) within group (order by n) as baseline, count(*)::int as samples
      from bins where channel_id = s.channel and people >= 3
        and t < date_bin('10 minutes', s.at, timestamptz '2000-01-01')
        and t >= date_bin('10 minutes', s.at, timestamptz '2000-01-01') - interval '7 days'
    ) b
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'userId', p.user_id, 'image', p.image) order by p.n desc, p.author_id), '[]'::jsonb) as participants
      from (
        select m.author_id, max(m.author_name) as name, u.id as user_id, u.image, count(*) as n
        from chat_messages m
        left join account a on a."accountId" = m.author_id and a."providerId" = 'discord'
        left join "user" u on u.id = a."userId" and not coalesce(u.banned, false)
        where m.channel_id = s.channel
          and m.created_at >= date_bin('10 minutes', s.at, timestamptz '2000-01-01')
          and m.created_at < date_bin('10 minutes', s.at, timestamptz '2000-01-01') + interval '10 minutes'
        group by m.author_id, u.id, u.image order by n desc, m.author_id limit 5
      ) p
    ) p`;
  return moments.map(m => {
    const r = rows.find(row => row.url === m.url);
    return { ...m, baseline: r?.baseline == null ? null : Number(r.baseline), baselineSamples: Number(r?.samples ?? 0), participants: (r?.participants as DiscoveryPerson[] | undefined) ?? [] };
  });
}

export async function discoveryPeople(): Promise<DiscoveryPerson[]> {
  const sql = await db();
  const rows = await sql`select id, name, image from "user" where not coalesce(banned, false)`;
  return rows.map(r => ({ userId: r.id as string, name: r.name as string, image: r.image as string | null }));
}
