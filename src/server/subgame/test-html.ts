// 테스트용 일정표 항목. 파서가 읽는 data-hc-* 속성만 만든다.
export function calendarTag(attrs: { key: string; game: string; title: string; meta: string }) {
  const pairs = { 'data-hc-title': attrs.title, 'data-hc-sub': attrs.game, 'data-hc-meta': attrs.meta, 'data-hc-memo-key': attrs.key };
  return '<a ' + Object.entries(pairs).map(([name, value]) => name + '="' + value + '"').join(' ') + '></a>';
}
