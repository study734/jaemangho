// 주간 칭호의 이름과 설명. 이름을 바꾸거나 종류를 더하려면 여기와 src/server/chat/awards.ts의 계산을 함께 고친다.
export const TITLES = {
  talker: { label: '수다 갤러', blurb: '가장 말을 많이 한 사람', unit: '메시지' },
  owl: { label: '새벽 갤러', blurb: '새벽 2~6시에 가장 많이 깨어 있던 사람', unit: '새벽 메시지' },
  popular: { label: '인기 갤러', blurb: '반응을 가장 많이 받은 사람', unit: '반응' },
  oneshot: { label: '한 방 갤러', blurb: '메시지 하나로 가장 큰 반응을 받은 사람', unit: '반응' },
  lurker: { label: '눈팅러', blurb: '접속은 했는데 한마디도 안 한 사람', unit: '' },
} as const;
export type TitleKey = keyof typeof TITLES;
export const isTitleKey = (k: string): k is TitleKey => k in TITLES;
