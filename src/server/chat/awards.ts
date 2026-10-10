import type { Sql } from '../db';
import { db } from '../db';
import { pool } from '../pool';
import { type TitleKey, isTitleKey } from '../../lib/titles';

// 한 주(한국 시간 월~일)의 칭호를 계산해 보관한다. 데이터가 너무 적은 주(봇이 안 돌았던 주 등)는 만들지 않는다.
const MIN_WEEK_MESSAGES = 20;
const MIN = { talker: 10, owl: 5, magnet: 5, oneshot: 3, replier: 10, jester: 30, laugher: 50 } as const;

interface Winner {
  title: TitleKey;
  authorId: string;
  authorName: string;
  value: number;
}

async function compute(sql: Sql, weekStart: string): Promise<Winner[]> {
  // 그 주의 시작과 끝(한국 시간 월요일 0시)
  const [{ lo, hi }] = (await sql`select (${weekStart}::timestamp at time zone 'Asia/Seoul') as lo,
    ((${weekStart}::timestamp + interval '7 days') at time zone 'Asia/Seoul') as hi`) as { lo: Date; hi: Date }[];

  const [{ n }] = (await sql`select count(*)::int as n from chat_messages where created_at >= ${lo} and created_at < ${hi}`) as { n: number }[];
  if (n < MIN_WEEK_MESSAGES) return [];

  const one = async (title: TitleKey, rows: Record<string, unknown>[]): Promise<Winner[]> =>
    rows.length ? [{ title, authorId: rows[0].author_id as string, authorName: rows[0].author_name as string, value: rows[0].value as number }] : [];

  const [talker, owl, magnet, oneshot, replier, jester, laugher, lurkers] = await Promise.all([
    sql`select author_id, max(author_name) as author_name, count(*)::int as value from chat_messages
        where created_at >= ${lo} and created_at < ${hi} group by author_id having count(*) >= ${MIN.talker} order by value desc, author_id limit 1`,
    sql`select author_id, max(author_name) as author_name, count(*)::int as value from chat_messages
        where created_at >= ${lo} and created_at < ${hi} and extract(hour from created_at at time zone 'Asia/Seoul') between 2 and 5
        group by author_id having count(*) >= ${MIN.owl} order by value desc, author_id limit 1`,
    // 떡밥 갤러: 받은 답글(본인 답글 제외)이 가장 많은 사람
    sql`select m.author_id, max(m.author_name) as author_name, count(r.id)::int as value from chat_messages m
        join chat_messages r on r.reply_to = m.id and r.author_id <> m.author_id
        where m.created_at >= ${lo} and m.created_at < ${hi} group by m.author_id having count(r.id) >= ${MIN.magnet} order by value desc, m.author_id limit 1`,
    // 한 방 갤러: 메시지 하나의 (반응 + 받은 답글)이 가장 큰 사람
    sql`select author_id, author_name, value from (
          select m.author_id, m.author_name, m.created_at,
                 (m.reactions + (select count(*) from chat_messages r where r.reply_to = m.id and r.author_id <> m.author_id))::int as value
          from chat_messages m where m.created_at >= ${lo} and m.created_at < ${hi}) x
        where value >= ${MIN.oneshot} order by value desc, created_at limit 1`,
    sql`select author_id, max(author_name) as author_name, count(*)::int as value from chat_messages
        where created_at >= ${lo} and created_at < ${hi} and reply_to is not null group by author_id having count(*) >= ${MIN.replier} order by value desc, author_id limit 1`,
    // 웃음 유발자: 그 사람 말 직후 2분 안에 다른 사람들이 보낸 ㅋ의 합이 가장 큰 사람 (웃음 분석을 켰을 때만 데이터가 있다)
    sql`select m.author_id, max(m.author_name) as author_name, sum(l.s)::int as value from chat_messages m
        cross join lateral (select coalesce(sum(o.laugh), 0)::int as s from chat_messages o
          where o.channel_id = m.channel_id and o.laugh > 0 and o.author_id <> m.author_id and o.created_at > m.created_at and o.created_at <= m.created_at + interval '2 minutes') l
        where m.created_at >= ${lo} and m.created_at < ${hi} group by m.author_id having sum(l.s) >= ${MIN.jester} order by value desc, m.author_id limit 1`,
    sql`select author_id, max(author_name) as author_name, sum(laugh)::int as value from chat_messages
        where created_at >= ${lo} and created_at < ${hi} group by author_id having sum(laugh) >= ${MIN.laugher} order by value desc, author_id limit 1`,
    // 눈팅러: 그 주에 로그인(세션 생성)했지만 채팅은 한 번도 안 한 멤버
    sql`select a."accountId" as author_id, u.name as author_name, 0 as value from "user" u
        join account a on a."userId" = u.id and a."providerId" = 'discord'
        where not coalesce(u.banned, false)
          and exists (select 1 from session s where s."userId" = u.id and s."createdAt" >= ${lo} and s."createdAt" < ${hi})
          and not exists (select 1 from chat_messages m where m.author_id = a."accountId" and m.created_at >= ${lo} and m.created_at < ${hi})
        order by u.name limit 10`,
  ]);

  return [
    ...(await one('talker', talker)),
    ...(await one('owl', owl)),
    ...(await one('magnet', magnet)),
    ...(await one('oneshot', oneshot)),
    ...(await one('replier', replier)),
    ...(await one('jester', jester)),
    ...(await one('laugher', laugher)),
    ...lurkers.map((r) => ({ title: 'lurker' as const, authorId: r.author_id as string, authorName: r.author_name as string, value: 0 })),
  ];
}

// 가장 최근에 끝난 주(한국 시간 월~일)의 칭호를 다시 계산해 저장한다. 끝난 주의 메시지는 보관돼 있어 결과가 안정적이다.
export async function recordAwards(now = new Date()): Promise<string | null> {
  const sql = await db();
  const [{ week }] = (await sql`select to_char(date_trunc('week', ${now.toISOString()}::timestamptz at time zone 'Asia/Seoul') - interval '7 days', 'YYYY-MM-DD') as week`) as { week: string }[];
  const winners = await compute(sql, week);
  if (!winners.length) return null;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from chat_awards where week_start = $1::date', [week]);
    await client.query(`insert into chat_awards (week_start, title, author_id, author_name, value)
      select $1::date, * from unnest($2::text[], $3::text[], $4::text[], $5::int[])`,
    [week, winners.map(w => w.title), winners.map(w => w.authorId), winners.map(w => w.authorName), winners.map(w => w.value)]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return week;
}

export interface AwardRow {
  week: string;
  title: TitleKey;
  authorName: string;
  authorUserId: string | null;
  value: number;
}

export async function listAwards(limitWeeks = 12): Promise<AwardRow[]> {
  const sql = await db();
  const rows = await sql`select to_char(w.week_start, 'YYYY-MM-DD') as week, w.title, w.author_name as "authorName", w.value, a."userId" as "userId"
    from chat_awards w left join account a on a."accountId" = w.author_id and a."providerId" = 'discord'
    where w.week_start in (select distinct week_start from chat_awards order by week_start desc limit ${limitWeeks})
    order by w.week_start desc, w.title, w.author_name`;
  return rows
    .filter((r) => isTitleKey(r.title as string))
    .map((r) => ({ week: r.week as string, title: r.title as TitleKey, authorName: r.authorName as string, authorUserId: (r.userId as string | null) ?? null, value: r.value as number }));
}

// 한 멤버가 모은 칭호(종류별 횟수와 마지막으로 받은 주)
export async function awardsForUser(userId: string): Promise<{ title: TitleKey; count: number; lastWeek: string }[]> {
  const sql = await db();
  const rows = await sql`select w.title, count(*)::int as count, to_char(max(w.week_start), 'YYYY-MM-DD') as "lastWeek"
    from chat_awards w join account a on a."accountId" = w.author_id and a."providerId" = 'discord' and a."userId" = ${userId}
    group by w.title order by count desc, w.title`;
  return rows.filter((r) => isTitleKey(r.title as string)).map((r) => ({ title: r.title as TitleKey, count: r.count as number, lastWeek: r.lastWeek as string }));
}
