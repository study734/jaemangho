import { z } from 'zod';
import { privateMessage, type Interaction, type Message } from './protocol';

const SEARCH = 'https://api.trace.moe/search';
const episode = z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))]).nullish();
const traceResponse = z.object({ result: z.array(z.object({
  anilist: z.object({ id: z.number(), title: z.object({ native: z.string().nullish(), romaji: z.string().nullish(), english: z.string().nullish() }) }),
  episode, from: z.number(), similarity: z.number(),
})) });

type MessageCommand = Extract<Extract<Interaction, { type: 2 }>['data'], { name: '출처 찾기' }>;

// The first image/video attachment of the clicked message. Embeds and link previews are not looked up.
export function attachmentUrl(data: MessageCommand): string | null {
  const found = data.resolved.messages[data.target_id]?.attachments.find(a => /^(image|video)\//.test(a.content_type ?? ''));
  return found?.url ?? null;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export async function findSource(data: MessageCommand, fetchFn: typeof fetch = fetch): Promise<Message> {
  const url = attachmentUrl(data);
  if (!url) return privateMessage('이미지나 영상이 첨부된 메시지에서 실행해 주세요.');
  let response: Response;
  try {
    response = await fetchFn(`${SEARCH}?anilistInfo&cutBorders&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  } catch { return privateMessage('출처 검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  // 402 quota exhausted, 429 too many concurrent searches for the shared guest IP.
  if (response.status === 402 || response.status === 429) return privateMessage('출처 검색 한도에 걸렸어요. 잠시 뒤에 다시 시도해 주세요.');
  const parsed = response.ok ? traceResponse.safeParse(await response.json().catch(() => null)) : null;
  if (!parsed?.success) {
    console.error('trace.moe lookup failed:', response.status);
    return privateMessage('출처를 찾지 못했어요. 애니 장면이 아니거나 이미지를 읽지 못했을 수 있어요.');
  }
  const best = parsed.data.result[0];
  if (!best) return privateMessage('비슷한 애니 장면을 찾지 못했어요.');
  const { native, romaji, english } = best.anilist.title;
  const title = [native ?? romaji ?? english, native && romaji ? `(${romaji})` : ''].filter(Boolean).join(' ');
  const ep = Array.isArray(best.episode) ? best.episode.join(', ') : best.episode;
  const percent = Math.round(best.similarity * 100);
  return privateMessage([
    `**${title}**${ep != null && ep !== '' ? ` ${ep}화` : ''} · ${clock(best.from)} 부근 · 일치도 ${percent}%`,
    best.similarity < 0.9 ? '일치도가 낮아 다른 작품일 수 있어요.' : '',
    // Angle brackets only suppress Discord's link preview; plain concatenation, not an HTML template.
    '<https://anilist.co/anime/' + best.anilist.id + '>',
  ].filter(Boolean).join('\n'));
}
