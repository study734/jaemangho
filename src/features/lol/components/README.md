# 롤 UI 컴포넌트 구성

화면은 UI를 조합하고 화면 간에 공유할 상태만 조율한다. 표시 컴포넌트는 필요한 데이터와 콜백을 props로 받고 직접 API를 호출하지 않는다. 입력 초안은 해당 폼 안에 둔다.

## 대시보드

- `Dashboard`: 상세 조회 대상과 로딩 상태를 조율한다.
- `ActiveGamesPanel`: 게임 중인 소환사 목록과 빈 상태를 표시한다.
- `ActiveGameCard`: 한 게임의 챔피언·시간·아군/적군을 표시한다. 내부 `GameTeam`을 두 팀이 공유한다.
- `TierLeaderboard`: 랭킹 정렬과 표를 표시하고 소환사 선택을 전달한다.
- `PlayerDetailsDialog`: 모달 열기·닫기와 접근성, 상세 로딩·빈 상태를 담당한다.
- `MatchHistoryCard`: 전적 하나를 표시한다. 현재 시각을 props로 받아 표시 결과를 일관되게 유지한다.

## 소환사 관리

- `SquadManager`: 추가 폼 열림과 현재 편집 대상을 조율한다.
- `AddSummonerForm`: 검색·직접 등록 입력과 검색 상태를 관리한다.
- `SummonerPreview`: 검색 결과와 다시 검색·등록 행동을 표시한다.
- `RosterMemberCard`: 계정과 능력치를 표시한다. `children`에 편집 폼을 넣을 수 있다.
- `EditSummonerForm`: 한 소환사의 편집 초안과 저장·취소를 관리한다.

## 재사용 기준

- `RankLabel`: 랭킹·상세·검색 미리보기·멤버 카드·프로필 계정 표시에서 티어 색과 최상위 티어의 랭크 생략을 공유한다.
- `SummonerStatsFields`: 직접 등록·편집에서 레벨·LP·티어·랭크·승패의 입력과 라벨·옵션을 공유한다. 데이터와 변경 콜백으로 제어하며 폼이나 저장 동작을 만들지 않는다.
- `RiotImage`: 기존 이미지 경로와 실패 대체 표시를 공유한다.

각 컴포넌트의 스타일은 같은 파일에 둔다. 반응형 규칙은 기존 `globals.css` 클래스와 `DESIGN.md`를 따른다. 롤 전용 UI는 이 기능 안에서 재사용하고, 기능 밖의 화면은 `features/lol/index.ts`에 공개된 인터페이스를 사용한다.
