// 주간 칭호의 이름과 설명. 이름을 바꾸거나 종류를 더하려면 여기와 src/server/chat/awards.ts의 계산을 함께 고친다.
// jester, laugher는 웃음 분석(CHAT_LAUGH)을 켠 뒤에만 나온다.
export const TITLES = {
  talker: { label: '수다 갤러', blurb: '가장 말을 많이 한 사람', unit: '메시지' },
  owl: { label: '새벽 갤러', blurb: '새벽 2~6시에 가장 많이 깨어 있던 사람', unit: '새벽 메시지' },
  magnet: { label: '떡밥 갤러', blurb: '남들이 가장 많이 답글을 단 사람', unit: '받은 답글' },
  oneshot: { label: '한 방 갤러', blurb: '메시지 하나로 가장 큰 반응(답글+반응)을 받은 사람', unit: '반응+답글' },
  replier: { label: '답장 갤러', blurb: '가장 많이 답장한 사람', unit: '답장' },
  jester: { label: '웃음 유발자', blurb: '그 사람 말 직후에 ㅋㅋㅋ가 가장 많이 터진 사람', unit: 'ㅋ' },
  laugher: { label: 'ㅋ 갤러', blurb: '가장 많이 웃은 사람', unit: 'ㅋ' },
  lurker: { label: '눈팅러', blurb: '접속은 했는데 한마디도 안 한 사람', unit: '' },
} as const;
export type TitleKey = keyof typeof TITLES;
export const isTitleKey = (k: string): k is TitleKey => k in TITLES;
