// subgamecals.com 일정 페이지(서버 렌더링 HTML)에서 일정 목록을 읽는다.
// 항목은 <a data-hc-title data-hc-sub data-hc-meta data-hc-memo-key> 로 들어 있고 한 항목이 여러 번 나온다.
// 연도는 쓰지 않는다: 날짜 문구는 사이트가 보여주는 그대로 전달한다.
export const CALENDAR_URL = 'https://www.subgamecals.com/calendar';

export class SubgameFormatError extends Error {}
export class SubgameFetchError extends Error {}

export type EventStatus = '진행중' | '예정' | '종료';
export interface CalendarEvent { key: string; game: string; title: string; kind: string; range: string; status: EventStatus }

const STATUSES: readonly string[] = ['진행중', '예정', '종료'];
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
const unescapeHtml = (v: string) => v.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|quot|lt|gt|apos));/gi, (_, hex, dec, name) =>
  name ? ENTITIES[name.toLowerCase()] : String.fromCodePoint(Number.parseInt(hex ?? dec, hex ? 16 : 10)));

// 형식이 바뀌어 읽을 수 있는 항목이 하나도 없으면 빈 목록이 아니라 오류로 드러낸다.
export function parseCalendar(html: string): { events: CalendarEvent[]; skipped: number } {
  const anchors = html.match(/<a\b[^>]*\bdata-hc-title="[^"]*"[^>]*>/g) ?? [];
  const events = new Map<string, CalendarEvent>();
  let skipped = 0;
  for (const tag of anchors) {
    const attr = (name: string) => { const m = new RegExp(`\\bdata-hc-${name}="([^"]*)"`).exec(tag); return m ? unescapeHtml(m[1]) : ''; };
    const key = attr('memo-key');
    const [kind, range, status] = attr('meta').split(' · ');
    const game = attr('sub');
    if (!key || !game || !kind || !range || !STATUSES.includes(status)) { skipped++; continue; }
    events.set(key, { key, game, title: attr('title'), kind, range, status: status as EventStatus });
  }
  if (!events.size) throw new SubgameFormatError(anchors.length ? 'no_parsable_events' : 'no_events_found');
  return { events: [...events.values()], skipped };
}

export async function fetchCalendar(month: string, fetchFn: typeof fetch = fetch) {
  let res: Response;
  try { res = await fetchFn(`${CALENDAR_URL}?month=${month}`, { signal: AbortSignal.timeout(15_000), cache: 'no-store', headers: { 'User-Agent': 'jaemangho-subgame-feed (private friend app)' } }); }
  catch { throw new SubgameFetchError('network'); }
  if (!res.ok) throw new SubgameFetchError(`http_${res.status}`);
  return parseCalendar(await res.text());
}
