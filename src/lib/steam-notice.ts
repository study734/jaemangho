// Steam 공통 게임 이용 고지(intent/0005). 웹 동의 창·/connect/steam·디스코드 동의 버튼이 같은 문구를 쓴다.
// 문구의 뜻을 바꾸면 src/server/steam/consent.ts의 STEAM_FEATURE_NOTICE(고지 버전)를 올릴지 함께 정한다.
export const STEAM_NOTICE_TITLE = 'Steam 공통 게임 이용 동의';
export const STEAM_NOTICE_INTRO = '함께할 멤버 모두에게 맞는 협동 게임을 추천하기 위해 Steam 기록과 취향을 사용해요. 아래 내용에 동의해야 이 기능을 사용할 수 있어요.';
export const STEAM_NOTICE_ITEMS: { term: string; text: string }[] = [
  { term: '사용하는 데이터', text: '공개 보유 게임·누적 및 최근 플레이 기록, 내가 저장한 좋아함·피함 취향, 동의 후 관측한 플레이 시간 증가분을 공통 추천에 반영해요. 취향 원문은 다른 멤버에게 표시하지 않아요.' },
  { term: '미리 기록 준비', text: 'Steam에서 본인 확인을 마친 내 계정만 첫 기준 기록을 준비해요. 이후에는 방문하지 않아도 하루 한 번 예약 수집으로, 그리고 방문할 때 7일 이상 지난 기록을 갱신해요. 무료 사용량을 지키려고 갱신이 늦어질 수 있어요.' },
  { term: '보관과 통제', text: '기록은 직접 삭제할 때까지 보관해요. 추천 데이터 설정에서 수집을 중단하거나 기록·취향을 삭제하고 이용 동의를 철회할 수 있어요. 실제 플레이 시각이나 실력·만족도를 추측하지 않아요.' },
];
export const STEAM_NOTICE_COUNTRY_TERM = '저장 국가';

// 웹 기능(features)은 src/lib를 직접 가져오지 않으므로, GET /api/steam/consent 응답과 /connect/steam props로 이 모양을 넘긴다.
export interface SteamNotice { title: string; intro: string; items: { term: string; text: string }[]; countryTerm: string }
export const STEAM_NOTICE: SteamNotice = { title: STEAM_NOTICE_TITLE, intro: STEAM_NOTICE_INTRO, items: STEAM_NOTICE_ITEMS, countryTerm: STEAM_NOTICE_COUNTRY_TERM };
