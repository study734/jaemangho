import { describe, expect, it } from 'vitest';
import { noticeSchema } from './game-notices';

describe('게임 일정·코드 입력 검증', () => {
  const event = { kind: 'event', game: '원신', title: '신규 이벤트', startsAt: '2026-10-20T10:00:00+09:00' };
  it('일정은 시작 시각이, 코드는 코드 값이 필요하다', () => {
    expect(noticeSchema.safeParse(event).success).toBe(true);
    expect(noticeSchema.safeParse({ ...event, startsAt: undefined }).success).toBe(false);
    expect(noticeSchema.safeParse({ kind: 'code', game: '원신', title: '보상' }).success).toBe(false);
    expect(noticeSchema.safeParse({ kind: 'code', game: '원신', title: '보상', code: 'ABC123' }).success).toBe(true);
  });
  it('종료가 시작보다 빠르거나 알 수 없는 필드는 거부한다', () => {
    expect(noticeSchema.safeParse({ ...event, endsAt: '2026-10-19T10:00:00+09:00' }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...event, extra: 1 }).success).toBe(false);
  });
});
