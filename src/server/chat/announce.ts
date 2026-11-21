import { db } from '../db';
import { reportFailure } from '../diagnostics';
import { DiscordRequestError } from './bot';
import { awardChannel } from './award-post';
import { patchNotesFor, type PatchNote } from '../../lib/patch-notes';

// 재순이 자동 공지(intent/0004). 매일 운영 보조 점검(/api/cron/ops-watchdog) 뒤 시상식 채널에 아직 안 올린 공지를 하나 올린다.
// - 순서: 사용법 안내(GUIDE_VERSION마다 한 번) → 아직 알리지 않은 디스코드 패치노트를 한 메시지로 묶어서.
// - 처음 켜질 때는 지금까지의 패치노트를 건너뛴다(안내가 현재 기능을 설명한다).
// - 같은 공지는 한 번만: 'posting'으로 자리를 잡은 실행만 올린다. Discord가 거절(4xx)하면 'failed'로 남겨 다음 날 다시 시도하고,
//   올라갔는지 모르는 결과(시간 초과·네트워크·5xx)는 'unknown'으로 남겨 다시 올리지 않는다(중복 게시보다 한 번 빠지는 쪽을 택함).
// 문구를 고쳐 다시 알리려면 GUIDE_VERSION을 올린다.
const DISCORD = 'https://discord.com/api/v10';
const LIMIT = 2000;
export const GUIDE_VERSION = 1;
export const GUIDE_KEY = `guide:v${GUIDE_VERSION}`;
export const GUIDE = [
  '## ⚓ 재순이 사용법',
  '채팅창에 `/`를 치면 재순이 명령이 보여요. 사이트에 들어가지 않아도, **로그인 없이** 바로 쓸 수 있어요.',
  '',
  '📣 `/모집` — 같이 할 사람을 이 채널에 모아요. 참여·나가기 버튼으로 들어오고 나가요',
  '🏆 `/기록` — 지난주 시상식·개념글·뜨거웠던 순간',
  '👤 `/멤버` — 멤버의 롤·Steam 계정과 칭호',
  '⚔️ `/전적` — 롤 랭크와 최근 경기',
  '📜 `/패치노트` — 재순이에게 새로 생긴 기능',
  '🔎 메시지 우클릭 → 앱 → `출처 찾기` — 짤의 애니 출처 찾기',
  '🎮 `/게임추천` — 같이 할 친구들의 Steam 게임 추천. 처음 한 번만 재순이가 주는 버튼으로 Steam을 연결해요(한 화면, 1분)',
  '',
  '💬 불편한 점이나 바라는 점은 `/의견`으로 보내 주세요. 메시지 우클릭 → 앱 → `재순이에게 전달`로도 보낼 수 있어요.',
  '-# 새 기능이 생기면 재순이가 여기에 알려 드려요.',
].join('\n');

export const noteKey = (note: PatchNote) => `${note.date}:${note.title}`;
const noteBlock = (note: PatchNote) => `\n\n**${note.title}**\n${note.items.map(item => `• ${item}`).join('\n')}`;
const NOTES_HEADER = '## 📢 재순이 새 소식';
const NOTES_FOOTER = '\n\n-# 지난 소식은 `/패치노트`, 불편한 점은 `/의견`으로 알려 주세요.';

export interface Announcement { key: string; covers: string[]; content: string }

// 무엇을 올릴지 정한다(DB 없음). notes는 최신순, covered는 이미 알린 키, first는 공지 기록이 하나도 없을 때.
export function nextAnnouncement(notes: PatchNote[], covered: ReadonlySet<string>, first: boolean): { skip: string[]; post: Announcement | null } {
  const skip = first ? notes.map(noteKey) : [];
  if (first || !covered.has(GUIDE_KEY)) return { skip, post: { key: GUIDE_KEY, covers: [GUIDE_KEY], content: GUIDE } };
  // 오래된 것부터 읽히도록 담되, 한도를 넘으면 오래된 쪽을 먼저 올리고 나머지는 다음 공지로 남긴다.
  const pending = notes.filter(note => !covered.has(noteKey(note))).reverse();
  const included: PatchNote[] = [];
  let content = NOTES_HEADER;
  for (const note of pending) {
    const block = noteBlock(note);
    if (content.length + block.length + NOTES_FOOTER.length > LIMIT) break;
    content += block; included.push(note);
  }
  if (!included.length) return { skip, post: null };
  return { skip, post: { key: `notes:${noteKey(included.at(-1)!)}`, covers: included.map(noteKey), content: content + NOTES_FOOTER } };
}

export type AnnounceResult =
  | { status: 'disabled' | 'none' | 'busy' }
  | { status: 'posted'; key: string }
  | { status: 'failed' | 'unknown'; key: string; code: string };

export async function postAnnouncements({ token, fetchFn = fetch, notes = patchNotesFor('discord') }:
  { token: string | undefined; fetchFn?: typeof fetch; notes?: PatchNote[] }): Promise<AnnounceResult> {
  const channelId = await awardChannel();
  if (!channelId || !token) return { status: 'disabled' };
  const sql = await db();
  const rows = await sql`select covers, status from discord_announcements`;
  const covered = new Set(rows.filter(row => row.status !== 'failed').flatMap(row => row.covers as string[]));
  const { skip, post } = nextAnnouncement(notes, covered, rows.length === 0);
  if (skip.length) await sql`insert into discord_announcements (key, covers, status) values ('baseline', ${skip}, 'skipped') on conflict do nothing`;
  if (!post) return { status: 'none' };
  const claimed = await sql`insert into discord_announcements (key, covers, status, channel_id) values (${post.key}, ${post.covers}, 'posting', ${channelId})
    on conflict (key) do update set status = 'posting', covers = excluded.covers, channel_id = excluded.channel_id, error_code = null, updated_at = now()
      where discord_announcements.status = 'failed'
    returning key`;
  if (!claimed.length) return { status: 'busy' };
  let code: string;
  try {
    const response = await fetchFn(`${DISCORD}/channels/${channelId}/messages`, {
      method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: post.content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(5000), cache: 'no-store',
    });
    if (response.ok) {
      const body = await response.json().catch(() => null) as { id?: unknown } | null;
      const messageId = typeof body?.id === 'string' && /^\d{17,20}$/.test(body.id) ? body.id : null;
      await sql`update discord_announcements set status = 'posted', message_id = ${messageId}, updated_at = now() where key = ${post.key}`;
      return { status: 'posted', key: post.key };
    }
    code = `discord_http_${response.status}`;
  } catch (error) {
    code = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'discord_timeout' : 'discord_network';
  }
  const status = code.startsWith('discord_http_4') ? 'failed' : 'unknown';
  await sql`update discord_announcements set status = ${status}, error_code = ${code}, updated_at = now() where key = ${post.key}`;
  reportFailure('chat.announce', new DiscordRequestError(code));
  return { status, key: post.key, code };
}
