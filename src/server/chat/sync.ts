import { db } from '../db';
import { recordAwards } from './awards';
import { DiscordRateLimitedError, fetchMessagePage, findWatchedChannels } from './bot';
import { recordDailyActivity } from './daily-activity';
import { recordHighlights } from './highlights';

// 이 표시가 이름에 들어간 채널만 본다. 바꾸려면 여기를 고친다.
export const WATCH_MARK = '⛵';
const MAX_DAYS = 8; // 처음 채우거나 크론이 오래 빠졌을 때 거슬러 올라가는 최대 기간(지난주 월~일을 월요일 새벽에도 덮도록 7일보다 하루 길게)
const REFRESH_DAYS = 3; // 평소에는 최근 이 기간만 다시 가져온다(반응·답글은 보통 이 안에 정해진다)
const KEEP_DAYS = 60;
const MAX_PAGES = 60;

// 마지막으로 끝까지 수집한 시각을 기준으로 빈 구간을 다시 받는다. 처음이면 MAX_DAYS.
export function syncCutoff(now: Date, completedAt: Date | null): number {
  const day = 86_400_000;
  const floor = now.getTime() - MAX_DAYS * day;
  if (!completedAt) return floor;
  return Math.max(floor, Math.min(now.getTime() - REFRESH_DAYS * day, completedAt.getTime() - day));
}

export interface SyncOptions {
  token: string;
  guildId: string;
  pageSize?: number;
  now?: Date;
  fetchFn?: typeof fetch;
  laugh?: boolean; // 웃음 분석(ㅋ 개수). 기본 꺼짐: 메시지 내용 권한과 CHAT_LAUGH=1을 둘 다 켰을 때만 쓴다
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number; // 이 시간 안에 끝낸다(함수 실행 제한보다 짧게). 한도 때문에 기다리는 시간도 포함
}
export interface SyncResult {
  channels: number;
  messages: number;
  rateLimited: boolean;
  warnings?: string[];
  truncated?: boolean;
}

export async function syncChat(o: SyncOptions): Promise<SyncResult> {
  const { token, guildId, pageSize = 100, now = new Date(), fetchFn = fetch, laugh = false, sleep, budgetMs = 50_000 } = o;
  const net = { fetchFn, sleep, deadline: Date.now() + budgetMs };
  const channels = await findWatchedChannels(guildId, WATCH_MARK, token, net);
  const sql = await db();
  const states = await sql`select channel_id, completed_at, started_at, cutoff_at, before_id, updated_at
    from chat_sync_state where channel_id = any(${channels.map(channel => channel.id)}::text[])`;
  const byChannel = new Map(states.map(state => [state.channel_id as string, state]));
  // 지난 실행에서 시도하지 못한 채널이 먼저 기회를 얻는다.
  channels.sort((a, b) => new Date((byChannel.get(a.id)?.updated_at as string | Date) ?? 0).getTime()
    - new Date((byChannel.get(b.id)?.updated_at as string | Date) ?? 0).getTime());
  let total = 0;
  let rateLimited = false;
  let truncated = false;

  for (const channel of channels) {
    if (Date.now() >= net.deadline) { rateLimited = true; break; }
    const state = byChannel.get(channel.id);
    let startedAt = state?.started_at ? new Date(state.started_at as string | Date) : now;
    let cutoff = state?.cutoff_at ? new Date(state.cutoff_at as string | Date).getTime()
      : syncCutoff(now, state?.completed_at ? new Date(state.completed_at as string | Date) : null);
    let before = (state?.before_id as string | null) ?? undefined;
    let needsCurrentSweep = startedAt.getTime() < now.getTime();
    await sql`insert into chat_sync_state (channel_id, started_at, cutoff_at, updated_at)
      values (${channel.id}, ${startedAt.toISOString()}, ${new Date(cutoff).toISOString()}, now())
      on conflict (channel_id) do update set started_at = excluded.started_at, cutoff_at = excluded.cutoff_at, updated_at = now()`;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { messages, rawCount, oldestId } = await fetchMessagePage(channel.id, token, { before, limit: pageSize, laugh }, net);
        const recent = messages.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
        if (recent.length) {
          await sql`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions, top_emoji, reply_to, laugh)
            select * from unnest(${recent.map((m) => m.id)}::text[], ${recent.map(() => channel.id)}::text[], ${recent.map((m) => m.authorId)}::text[],
              ${recent.map((m) => m.authorName)}::text[], ${recent.map((m) => m.createdAt)}::timestamptz[], ${recent.map((m) => m.reactions)}::int[], ${recent.map((m) => m.topEmoji)}::text[],
              ${recent.map((m) => m.replyTo)}::text[], ${recent.map((m) => m.laugh)}::int[])
            on conflict (id) do update set reactions = excluded.reactions, top_emoji = excluded.top_emoji, author_name = excluded.author_name,
              reply_to = excluded.reply_to, laugh = case when ${laugh}::boolean then excluded.laugh else chat_messages.laugh end, updated_at = now()`;
          total += recent.length;
        }
        // 마지막 페이지이거나, 이 페이지의 가장 오래된 메시지가 기간 밖이면 끝
        const oldest = messages.at(-1);
        if (rawCount < pageSize || !oldestId || (oldest && new Date(oldest.createdAt).getTime() < cutoff)) {
          // 먼저 중단된 순회를 완료한다.
          await sql`update chat_sync_state set completed_at = ${startedAt.toISOString()}, started_at = null,
            cutoff_at = null, before_id = null, updated_at = now() where channel_id = ${channel.id}`;
          if (needsCurrentSweep) {
            // 이어 받는 동안 새로 생긴 메시지도 확인한 뒤에만 집계를 갱신한다.
            needsCurrentSweep = false;
            cutoff = syncCutoff(now, startedAt);
            startedAt = now;
            before = undefined;
            await sql`update chat_sync_state set started_at = ${now.toISOString()}, cutoff_at = ${new Date(cutoff).toISOString()},
              updated_at = now() where channel_id = ${channel.id}`;
            if (page === MAX_PAGES - 1) truncated = true;
            continue;
          }
          break;
        }
        before = oldestId;
        // 메시지 저장 뒤에만 커서를 전진시킨다. 중간 실패는 같은 페이지를 다시 받아도 안전하다.
        await sql`update chat_sync_state set before_id = ${before}, updated_at = now() where channel_id = ${channel.id}`;
        if (page === MAX_PAGES - 1) truncated = true;
      }
    } catch (e) {
      if (!(e instanceof DiscordRateLimitedError)) throw e;
      // 기다려도 안 풀리거나 기한이 다 됐다. 저장한 커서부터 다음 실행에서 이어 받는다.
      rateLimited = true;
    }
  }

  // 개념글 보관함과 지난주 칭호를 갱신한다. 실패해도 동기화 결과는 돌려준다.
  const warnings: string[] = [];
  await recordHighlights(now).catch((e) => { warnings.push('highlights_failed'); console.error('record highlights failed', e); });
  if (!rateLimited && !truncated && channels.length > 0) {
    // 불완전한 기록으로 기존 주간 결과를 덮어쓰지 않는다.
    await recordAwards(now).catch((e) => { warnings.push('awards_failed'); console.error('record awards failed', e); });
    await recordDailyActivity(now).catch((e) => { warnings.push('daily_activity_failed'); console.error('record daily activity failed', e); });
  }

  await sql`delete from chat_messages where created_at < ${new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString()}`;
  return { channels: channels.length, messages: total, rateLimited, ...(warnings.length ? { warnings } : {}), ...(truncated ? { truncated } : {}) };
}
