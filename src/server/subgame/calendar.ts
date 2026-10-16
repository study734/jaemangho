// subgamecals.com 일정 페이지(서버 렌더링 HTML)에서 일정 목록을 읽는다.
// 항목은 <a data-hc-title data-hc-sub data-hc-meta data-hc-memo-key> 로 들어 있고 한 항목이 여러 번 나온다.
// 연도는 쓰지 않는다: 날짜 문구는 사이트가 보여주는 그대로 전달한다.
export const CALENDAR_URL = 'https://www.subgamecals.com/calendar';

// code·status·phase는 src/server/diagnostics.ts가 로그에 남기는 진단 정보다(메시지·주소는 남지 않는다).
export class SubgameFormatError extends Error { code = 'invalid_response'; phase = 'calendar'; }
export class SubgameFetchError extends Error {
  phase = 'calendar';
  code: 'network' | 'timeout' | 'invalid_response';
  status?: number;
  elapsedMs?: number;
  constructor(code: 'network' | 'timeout' | 'invalid_response', status?: number, elapsedMs?: number) { super(code); this.code = code; this.status = status; this.elapsedMs = elapsedMs; }
}

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
  const started = Date.now();
  const fail = (error: unknown) => { throw new SubgameFetchError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network', undefined, Date.now() - started); };
  let res: Response;
  try { res = await fetchFn(`${CALENDAR_URL}?month=${month}`, { signal: AbortSignal.timeout(15_000), cache: 'no-store', headers: { 'User-Agent': 'jaemangho-subgame-feed (private friend app)' } }); }
  catch (error) { return fail(error); }
  if (!res.ok) throw new SubgameFetchError('invalid_response', res.status, Date.now() - started);
  // 본문을 읽는 중의 시간 초과도 같은 방식으로 구분한다.
  let html: string;
  try { html = await res.text(); } catch (error) { return fail(error); }
  return parseCalendar(html);
}
