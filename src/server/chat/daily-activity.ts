import { db } from '../db';

const DAY_MS = 86_400_000;

// 원본 삭제 전에 최근 60일을 재계산한다. 같은 날을 다시 읽어도 누적하지 않고 교체한다.
// 메시지가 없던 날은 수집 누락과 구별할 수 없으므로 0행을 만들지 않는다.
export async function recordDailyActivity(now = new Date()) {
  const sql = await db();
  const oldest = new Date(now.getTime() - 60 * DAY_MS).toISOString();
  await sql`insert into discord_daily_activity (day, messages, replies, reactions, active_authors)
    select (created_at at time zone 'Asia/Seoul')::date,
      count(*)::int,
      count(*) filter (where reply_to is not null)::int,
      coalesce(sum(reactions), 0)::bigint,
      count(distinct author_id)::int
    from chat_messages
    where created_at >= ${oldest}::timestamptz and created_at < ${now.toISOString()}::timestamptz
    group by 1
    on conflict (day) do update set messages = excluded.messages, replies = excluded.replies,
      reactions = excluded.reactions, active_authors = excluded.active_authors, updated_at = now()`;
}
