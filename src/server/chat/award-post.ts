import { db } from '../db';
import { reportFailure } from '../diagnostics';
import { DiscordRequestError } from './bot';
import { TITLES, isTitleKey } from '../../lib/titles';

// 주간 시상식 자동 게시. 채팅 동기화가 지난주 칭호를 계산한 직후(sync.ts) 또는 관리자의 /운영 시상식게시에서 실행한다.
// - 관리자가 /운영 시상식채널로 채널을 정해야 켜진다. 봇 토큰(DISCORD_BOT_TOKEN)으로 그 채널에 공개로 올린다.
// - 주마다 한 번만 올린다. 먼저 discord_award_posts에 'posting'으로 자리를 잡고, 실패하면 'failed'로 남겨 다음 실행이 다시 시도한다.
// - 지난 시도가 응답 없이 끝났으면(시간 초과·네트워크 오류·'posting'에서 멈춤) Discord에는 실제로 올라갔을 수 있다.
//   그때는 다시 올리기 전에 채널의 최근 봇 메시지에서 같은 주 시상식을 찾고, 있으면 게시된 것으로 기록만 한다(중복 게시 방지).
//   찾기 자체가 실패하면 올리지 않고 다음 실행에서 다시 찾는다.
// - 공개 게시에서는 '눈팅러'(채팅을 안 한 사람)를 뺀다(사이트·/기록에는 남는다). 멘션 알림은 보내지 않는다.
const DISCORD = 'https://discord.com/api/v10';
const SITE = 'https://www.jaemangho.shop';
const PUBLIC_EXCLUDED = new Set(['lurker']);
const MAX_AGE_DAYS = 14; // 채널을 늦게 켰을 때 오래된 주를 새로 올리지 않는다.
const LOOKUP_LIMIT = 50; // 게시 직후 재시도까지 채널에 쌓일 수 있는 메시지 수보다 넉넉하게
const UNCERTAIN_CODES = new Set(['discord_timeout', 'discord_network']);

export type AwardPostResult =
  | { status: 'disabled' | 'no_awards' | 'already_posted' }
  | { status: 'posted'; week: string; channelId: string }
  | { status: 'failed'; week: string; channelId: string; code: string };

export async function awardChannel(): Promise<string | null> {
  const sql = await db();
  const [row] = await sql`select channel_id as "channelId" from discord_award_channel where id = 1`;
  return (row?.channelId as string | undefined) ?? null;
}

export async function setAwardChannel(channelId: string | null, setBy: string) {
  const sql = await db();
  if (!channelId) { await sql`delete from discord_award_channel where id = 1`; return; }
  await sql`insert into discord_award_channel (id, channel_id, set_by) values (1, ${channelId}, ${setBy})
    on conflict (id) do update set channel_id = excluded.channel_id, set_by = excluded.set_by, updated_at = now()`;
}

const escape = (name: string) => name.replace(/[\r\n]/g, ' ').slice(0, 80).replace(/[\\`*_~|[\]<>#@]/g, '\\$&');
const kstDay = (date: string, plusDays = 0) => new Date(Date.parse(`${date}T00:00:00+09:00`) + plusDays * 86_400_000)
  .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

// 칭호 한 줄 + 근거 한 줄(작은 글씨). 디스코드 게시와 /기록이 같은 모양을 쓴다.
export function awardLines(rows: { title: string; authorName: string; value: number }[], { publicPost = false } = {}): string[] {
  return rows.filter(row => isTitleKey(row.title) && !(publicPost && PUBLIC_EXCLUDED.has(row.title))).flatMap(row => {
    const title = TITLES[row.title as keyof typeof TITLES];
    const stat = title.unit ? `${title.unit} ${row.value.toLocaleString('ko-KR')}개 · ` : '';
    return [`${title.emoji} ${title.label} — **${escape(row.authorName)}**`, `-# ${stat}${title.blurb}`];
  });
}

export const weekRange = (week: string) => `${kstDay(week)}(월) ~ ${kstDay(week, 6)}(일)`;
// 게시 내용의 첫 두 줄. 이미 올라간 같은 주 게시를 찾을 때도 쓴다.
const awardHeader = (week: string) => `## 🏆 재망호 주간 시상식\n**${weekRange(week)}**`;

export function awardPostContent(week: string, rows: { title: string; authorName: string; value: number }[]): string | null {
  const lines = awardLines(rows, { publicPost: true });
  if (!lines.length) return null;
  return [awardHeader(week), '', ...lines, '',
    `-# 글 내용은 읽지 않고 반응·답글·메시지 수만 셌어요 · [지난 시상식](<${SITE}/community/awards>)`].join('\n');
}

export async function postWeeklyAwards({ token, fetchFn = fetch, now = new Date() }: { token: string | undefined; fetchFn?: typeof fetch; now?: Date }): Promise<AwardPostResult> {
  const channelId = await awardChannel();
  if (!channelId || !token) return { status: 'disabled' };
  const sql = await db();
  const [latest] = await sql`select to_char(max(week_start), 'YYYY-MM-DD') as week from chat_awards
    where week_start > ${now.toISOString()}::timestamptz - make_interval(days => ${MAX_AGE_DAYS})`;
  const week = latest?.week as string | null;
  if (!week) return { status: 'no_awards' };
  const rows = await sql`select title, author_name as "authorName", value from chat_awards where week_start = ${week}::date order by title, author_name`;
  const content = awardPostContent(week, rows as unknown as { title: string; authorName: string; value: number }[]);
  if (!content) return { status: 'no_awards' };
  // 자리 잡기: 처음이거나, 실패했거나, 10분 넘게 'posting'에 멈춘(중단된) 경우만 이 실행이 올린다.
  // 이전 상태도 함께 읽어, 응답 없이 끝난 시도 뒤인지 판단한다.
  const claimed = await sql`with prev as (select status, error_code from discord_award_posts where week_start = ${week}::date)
    insert into discord_award_posts (week_start, channel_id, status) values (${week}::date, ${channelId}, 'posting')
    on conflict (week_start) do update set status = 'posting', channel_id = excluded.channel_id, error_code = null, updated_at = now()
      where discord_award_posts.status = 'failed'
        or (discord_award_posts.status = 'posting' and discord_award_posts.updated_at < now() - interval '10 minutes')
    returning (select status from prev) as "prevStatus", (select error_code from prev) as "prevCode"`;
  if (!claimed.length) return { status: 'already_posted' };
  const { prevStatus, prevCode } = claimed[0] as { prevStatus: string | null; prevCode: string | null };
  const uncertain = prevStatus === 'posting' || (prevStatus === 'failed' && !!prevCode && (UNCERTAIN_CODES.has(prevCode) || prevCode.startsWith('discord_lookup')));
  let code: string;
  if (uncertain) {
    const found = await findPosted(fetchFn, token, channelId, awardHeader(week));
    if (typeof found === 'object') {
      await sql`update discord_award_posts set status = 'posted', message_id = ${found.messageId}, updated_at = now() where week_start = ${week}::date`;
      return { status: 'posted', week, channelId };
    }
    if (found !== 'absent') return fail(week, channelId, found);
  }
  try {
    const response = await fetchFn(`${DISCORD}/channels/${channelId}/messages`, {
      method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10_000), cache: 'no-store',
    });
    if (response.ok) {
      const body = await response.json().catch(() => null) as { id?: unknown } | null;
      const messageId = typeof body?.id === 'string' && /^\d{17,20}$/.test(body.id) ? body.id : null;
      await sql`update discord_award_posts set status = 'posted', message_id = ${messageId}, updated_at = now() where week_start = ${week}::date`;
      return { status: 'posted', week, channelId };
    }
    code = `discord_http_${response.status}`;
  } catch (error) {
    code = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'discord_timeout' : 'discord_network';
  }
  return fail(week, channelId, code);
}

async function fail(week: string, channelId: string, code: string): Promise<AwardPostResult> {
  const sql = await db();
  await sql`update discord_award_posts set status = 'failed', error_code = ${code}, updated_at = now() where week_start = ${week}::date`;
  reportFailure('chat.award-post', new DiscordRequestError(code));
  return { status: 'failed', week, channelId, code };
}

// 채널의 최근 메시지에서 봇이 올린 같은 주 시상식을 찾는다. 찾으면 메시지 id, 없으면 'absent', 조회 실패면 오류 코드.
async function findPosted(fetchFn: typeof fetch, token: string, channelId: string, header: string): Promise<{ messageId: string | null } | 'absent' | string> {
  try {
    const response = await fetchFn(`${DISCORD}/channels/${channelId}/messages?limit=${LOOKUP_LIMIT}`, {
      headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store',
    });
    if (!response.ok) return `discord_lookup_http_${response.status}`;
    const messages = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(messages)) return 'discord_lookup_invalid';
    const match = messages.find((m: { author?: { bot?: unknown }; content?: unknown }) =>
      m?.author?.bot === true && typeof m.content === 'string' && m.content.startsWith(header)) as { id?: unknown } | undefined;
    if (!match) return 'absent';
    return { messageId: typeof match.id === 'string' && /^\d{17,20}$/.test(match.id) ? match.id : null };
  } catch (error) {
    return error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'discord_lookup_timeout' : 'discord_lookup_network';
  }
}
