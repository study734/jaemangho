import { describe, expect, it } from 'vitest';
import { calendarTag } from './test-html';
import { failureDetails } from '../diagnostics';
import { fetchCalendar, parseCalendar, SubgameFormatError } from './calendar';

const anchor = (key: string, game: string, title: string, meta: string) => calendarTag({ key, game, title, meta });

describe('subgamecals 일정 파싱', () => {
  const html = [
    anchor('k1', '붕괴: 스타레일', '「호박색 달빛」&amp;「더미」 버전 업데이트', '업데이트 · 10월 8일 (목) ~ 10월 28일 (수) · 진행중'),
    anchor('k1', '붕괴: 스타레일', '「호박색 달빛」&amp;「더미」 버전 업데이트', '업데이트 · 10월 8일 (목) ~ 10월 28일 (수) · 진행중'),
    anchor('k2', '원신', '특별 방송', '공식방송 · 10월 6일 (화) · 종료'),
    anchor('k3', '원신', '깨진 항목', '이벤트 · 10월 6일 (화) · 알수없음'),
    '<a data-hc-title=\\"escaped\\">',
  ].join('\n');

  it('중복 항목을 하나로 합치고 HTML 엔티티를 풀며 읽을 수 없는 항목은 세어서 건너뛴다', () => {
    const { events, skipped } = parseCalendar(html);
    expect(events).toEqual([
      { key: 'k1', game: '붕괴: 스타레일', title: '「호박색 달빛」&「더미」 버전 업데이트', kind: '업데이트', range: '10월 8일 (목) ~ 10월 28일 (수)', status: '진행중' },
      { key: 'k2', game: '원신', title: '특별 방송', kind: '공식방송', range: '10월 6일 (화)', status: '종료' },
    ]);
    expect(skipped).toBe(1);
  });

  it('형식이 바뀌어 읽을 항목이 없으면 빈 목록이 아니라 오류다', () => {
    expect(() => parseCalendar('<html>없음</html>')).toThrow(SubgameFormatError);
    expect(() => parseCalendar(anchor('k', 'g', 't', '이상한 형식'))).toThrow(SubgameFormatError);
  });
});

describe('일정 가져오기 실패는 원인이 로그에 구분되어 남는다', () => {
  const diagnose = async (fetchFn: typeof fetch) => failureDetails(await fetchCalendar('2026-10', fetchFn).catch(error => error));

  it('시간 초과·연결 실패·HTTP 오류·형식 오류를 구분한다', async () => {
    const timeout = Object.assign(new Error('x'), { name: 'TimeoutError' });
    expect(await diagnose((async () => { throw timeout; }) as typeof fetch)).toMatchObject({ code: 'timeout', phase: 'calendar' });
    expect(await diagnose((async () => { throw new TypeError('fetch failed'); }) as typeof fetch)).toMatchObject({ code: 'network', phase: 'calendar' });
    expect(await diagnose((async () => new Response('no', { status: 403 })) as typeof fetch)).toMatchObject({ code: 'invalid_response', status: 403 });
    expect(await diagnose((async () => new Response('<html>없음</html>')) as typeof fetch)).toMatchObject({ code: 'invalid_response', phase: 'calendar' });
  });
});
