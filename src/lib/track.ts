// 열람 횟수를 세는 화면 목록. 여기에 없는 주소는 세지 않는다(표가 무한히 커지지 않게, 개인 식별 정보가 섞이지 않게).
// 새 화면이 생기면 여기에 한 줄 더한다.
export const TRACKED = {
  '/': '홈',
  '/lol': '롤 대시보드',
  '/lol/squad': '소환사 관리',
  '/lol/synergy': '듀오 시너지',
  '/lol/mastery': '챔피언 숙련도',
  '/lol/settings': '설정',
  '/steam': 'Steam 공통 게임',
  '/community': '개념글',
  '/community/awards': '시상식',
  '/people': '멤버 목록',
  '/people/[id]': '멤버 프로필',
  '/admin': '관리자',
} as const;
export type TrackKey = keyof typeof TRACKED;

// 실제 주소를 화면 키로 바꾼다. 프로필처럼 주소에 id가 들어가는 화면은 id를 버리고 하나로 합친다.
export function routeKey(pathname: string): TrackKey | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (p in TRACKED) return p as TrackKey;
  return /^\/people\/[^/]+$/.test(p) ? '/people/[id]' : null;
}
