import { describe, expect, it } from 'vitest';
import { parseCalendar, SubgameFormatError } from './calendar';

const anchor = (key: string, game: string, title: string, meta: string) =>
  `<a href="/events?q=x" class="c" data-hc="" data-hc-title="${title}" data-hc-sub="${game}" data-hc-meta="${meta}" data-hc-color="bg-rose-500" data-hc-memo-key="${key}" data-hc-like-count="0"><span title="${game}"></span></a>`;

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
