// 화면과 서버가 함께 쓰는 게임 일정·리딤코드 한 건의 모양.
export interface Notice {
  id: string; kind: 'event' | 'code'; game: string; title: string; code: string | null;
  startsAt: string | null; endsAt: string | null; userId: string; userName: string;
}
