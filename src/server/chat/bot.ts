import { z } from 'zod';

const DISCORD = 'https://discord.com/api/v10';

export class DiscordRateLimitedError extends Error {}

const channelSchema = z.array(z.object({ id: z.string(), name: z.string().nullish(), type: z.number() }));
const messageSchema = z.object({
  id: z.string(),
  type: z.number(),
  timestamp: z.string(),
  author: z.object({ id: z.string(), username: z.string(), global_name: z.string().nullish(), bot: z.boolean().optional() }),
  reactions: z.array(z.object({ count: z.number(), emoji: z.object({ id: z.string().nullable(), name: z.string().nullable() }) })).optional(),
});

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  reactions: number;
  topEmoji: string | null;
}

// 네트워크 의존: 테스트에서는 가짜 fetch와 sleep을 넣는다. deadline(ms 시각)을 넘길 기다림은 하지 않는다.
export interface Net {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  deadline?: number;
}
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const MAX_ATTEMPTS = 4;

// 호출 한도(429)에 걸리면 디스코드가 알려주는 시간(retry_after)만큼 기다렸다가 다시 시도한다.
// 남은 호출이 0이라고 알려주면 다음 호출 전에 미리 기다린다(한도에 부딪히지 않게). 기한을 넘기면 포기한다.
async function get(path: string, token: string, net: Net): Promise<unknown> {
  const { fetchFn = fetch, sleep = realSleep, deadline = Infinity } = net;
  for (let attempt = 1; ; attempt++) {
    const res = await fetchFn(`${DISCORD}${path}`, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(8000) });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      const waitMs = Math.ceil((typeof body.retry_after === 'number' ? body.retry_after : 1) * 1000) + 50;
      if (attempt >= MAX_ATTEMPTS || Date.now() + waitMs > deadline) throw new DiscordRateLimitedError();
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(`Discord API error (${res.status}) for ${path.split('?')[0].replace(/\d{5,}/g, ':id')}`);
    const resetMs = Math.ceil(Number(res.headers.get('x-ratelimit-reset-after') ?? 0) * 1000);
    if (res.headers.get('x-ratelimit-remaining') === '0' && resetMs > 0 && Date.now() + resetMs <= deadline) await sleep(resetMs);
    return res.json();
  }
}

// 이름에 mark(예: ⛵)가 들어 있는 텍스트·공지 채널. 허용한 채널만 본다.
export async function findWatchedChannels(guildId: string, mark: string, token: string, net: Net = {}) {
  const channels = channelSchema.parse(await get(`/guilds/${guildId}/channels`, token, net));
  return channels.filter((c) => (c.type === 0 || c.type === 5) && c.name?.includes(mark)).map((c) => ({ id: c.id, name: c.name ?? '' }));
}

const emojiLabel = (e: { id: string | null; name: string | null }) => (e.name ? (e.id ? `:${e.name}:` : e.name) : null);

// 채널의 메시지를 최신순으로 한 페이지. 사람이 쓴 일반 메시지(type 0 글, 19 답글)만 돌려준다.
// 봇에 메시지 내용 권한이 없어 content는 오지 않고, 우리도 읽지 않는다.
export async function fetchMessagePage(
  channelId: string,
  token: string,
  opts: { before?: string; limit?: number } = {},
  net: Net = {}
): Promise<{ messages: ChatMessage[]; rawCount: number; oldestId: string | null }> {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  if (opts.before) q.set('before', opts.before);
  const raw = z.array(z.unknown()).parse(await get(`/channels/${channelId}/messages?${q}`, token, net));
  const parsed = raw.flatMap((m) => {
    const r = messageSchema.safeParse(m);
    return r.success ? [r.data] : [];
  });
  const messages = parsed
    .filter((m) => (m.type === 0 || m.type === 19) && !m.author.bot)
    .map((m) => {
      const rs = m.reactions ?? [];
      const top = [...rs].sort((a, b) => b.count - a.count)[0];
      return {
        id: m.id,
        authorId: m.author.id,
        authorName: m.author.global_name ?? m.author.username,
        createdAt: m.timestamp,
        reactions: rs.reduce((n, r) => n + r.count, 0),
        topEmoji: top ? emojiLabel(top.emoji) : null,
      };
    });
  return { messages, rawCount: raw.length, oldestId: parsed.at(-1)?.id ?? null };
}
