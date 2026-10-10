import { db } from './db';

export class DiscoveryRecordMissingError extends Error {}

async function recordExists(cardId: string) {
  if (cardId === 'play:steam') return true;
  const sql = await db();
  if (cardId.startsWith('award:')) {
    const [, week, title] = cardId.split(':');
    const [row] = await sql`select 1 from chat_awards where week_start = ${week}::date and title = ${title} limit 1`;
    return Boolean(row);
  }
  const url = new URL(cardId.slice(cardId.indexOf(':') + 1));
  const [, , guild, channel, id] = url.pathname.split('/');
  if (guild !== process.env.DISCORD_GUILD_ID) return false;
  const rows = cardId.startsWith('highlight:')
    ? await sql`select 1 from chat_highlights where id = ${id} and channel_id = ${channel}`
    : await sql`select 1 from chat_messages where id = ${id} and channel_id = ${channel}`;
  return rows.length > 0;
}

export async function discoveryReaction(cardId: string, userId: string) {
  const sql = await db();
  const [row] = await sql`select count(*)::int as count, coalesce(bool_or(user_id = ${userId}), false) as reacted
    from discovery_reactions where card_id = ${cardId}`;
  return { count: Number(row.count), reacted: Boolean(row.reacted) };
}

// 「토글」 요청 대신 원하는 상태를 보내 재시도·더블 클릭에도 같은 결과를 만든다.
export async function setDiscoveryReaction(cardId: string, userId: string, reacted: boolean) {
  if (reacted && !await recordExists(cardId)) throw new DiscoveryRecordMissingError('Discovery record missing');
  const sql = await db();
  if (reacted) await sql`insert into discovery_reactions (card_id, user_id) values (${cardId}, ${userId}) on conflict do nothing`;
  else await sql`delete from discovery_reactions where card_id = ${cardId} and user_id = ${userId}`;
  return discoveryReaction(cardId, userId);
}
