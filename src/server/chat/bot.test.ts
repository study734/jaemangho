import { describe, expect, it, vi } from 'vitest';
import { DiscordRateLimitedError, countLaugh, fetchMessagePage, findWatchedChannels } from './bot';

const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const msg = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 0,
  timestamp: '2026-10-04T00:00:00.000Z',
  author: { id: 'u1', username: 'user1', global_name: '철수' },
  ...over,
});

describe('findWatchedChannels', () => {
  it('이름에 표시가 들어간 텍스트·공지 채널만 고른다', async () => {
    const fetchFn = reply([
      { id: '1', name: '⛵｜잡담', type: 0 },
      { id: '2', name: '공지', type: 0 },
      { id: '3', name: '⛵음성', type: 2 },
      { id: '4', name: '⛵공지', type: 5 },
      { id: '5', name: null, type: 0 },
    ]);
    expect(await findWatchedChannels('G', '⛵', 'tok', { fetchFn })).toEqual([{ id: '1', name: '⛵｜잡담' }, { id: '4', name: '⛵공지' }]);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('/guilds/G/channels'), expect.objectContaining({ headers: { Authorization: 'Bot tok' } }));
  });
});

describe('fetchMessagePage', () => {
  it('사람이 쓴 일반 메시지만, 반응 합계와 대표 이모지와 함께 돌려준다 (글 내용은 다루지 않는다)', async () => {
    const fetchFn = reply([
      msg('30', { content: '비밀 내용', reactions: [{ count: 2, emoji: { id: null, name: '😂' } }, { count: 5, emoji: { id: '9', name: 'ggg' } }] }),
      msg('29', { author: { id: 'b', username: 'bot', bot: true } }), // 봇
      msg('28', { type: 7 }), // 입장 같은 시스템 메시지
      msg('27', { type: 19 }), // 답글
      { not: 'a message' }, // 형식이 다른 항목은 무시
    ]);
    const page = await fetchMessagePage('c1', 'tok', { before: '99', limit: 50 }, { fetchFn });
    expect(page.messages).toEqual([
      { id: '30', authorId: 'u1', authorName: '철수', createdAt: '2026-10-04T00:00:00.000Z', reactions: 7, topEmoji: ':ggg:', replyTo: null, laugh: 0 },
      { id: '27', authorId: 'u1', authorName: '철수', createdAt: '2026-10-04T00:00:00.000Z', reactions: 0, topEmoji: null, replyTo: null, laugh: 0 },
    ]);
    expect(page).toMatchObject({ rawCount: 5, oldestId: '27' });
    expect(JSON.stringify(page)).not.toContain('비밀 내용');
    expect(fetchFn.mock.calls[0][0]).toContain('before=99');
    expect(fetchFn.mock.calls[0][0]).toContain('limit=50');
  });

  it('그 밖의 오류는 URL의 id를 가린 메시지로 던진다', async () => {
    await expect(fetchMessagePage('123456789012345678', 'tok', {}, { fetchFn: reply({}, 403) })).rejects.toThrow('Discord API error (403) for /channels/:id/messages');
  });
});

describe('호출 한도(429) 처리', () => {
  const sleep = () => vi.fn<(ms: number) => Promise<void>>(async () => {});
  const limited = (retryAfter?: number) => new Response(JSON.stringify(retryAfter === undefined ? {} : { retry_after: retryAfter }), { status: 429 });
  const ok = (headers: Record<string, string> = {}) => new Response(JSON.stringify([msg('1')]), { headers });

  it('429면 디스코드가 알려준 시간(retry_after)만큼 기다렸다가 다시 시도해 성공한다', async () => {
    const s = sleep();
    const fetchFn = vi.fn().mockResolvedValueOnce(limited(0.5)).mockResolvedValueOnce(ok());
    const page = await fetchMessagePage('c1', 'tok', {}, { fetchFn, sleep: s });
    expect(page.messages).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(s).toHaveBeenCalledTimes(1);
    expect(s).toHaveBeenCalledWith(550); // 0.5초 + 여유 50ms
  });

  it('계속 429면 몇 번 기다린 뒤 DiscordRateLimitedError', async () => {
    const s = sleep();
    const fetchFn = vi.fn(async () => limited(1));
    await expect(fetchMessagePage('c1', 'tok', {}, { fetchFn, sleep: s })).rejects.toBeInstanceOf(DiscordRateLimitedError);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(s).toHaveBeenCalledTimes(3);
  });

  it('기한(deadline) 안에 끝나지 않을 기다림은 하지 않고 바로 포기한다', async () => {
    const s = sleep();
    const fetchFn = vi.fn(async () => limited(30));
    await expect(fetchMessagePage('c1', 'tok', {}, { fetchFn, sleep: s, deadline: Date.now() + 5000 })).rejects.toBeInstanceOf(DiscordRateLimitedError);
    expect(s).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('남은 호출이 0이라고 알려주면 다음 호출 전에 미리 기다린다 (남아 있으면 기다리지 않는다)', async () => {
    const s = sleep();
    await fetchMessagePage('c1', 'tok', {}, { fetchFn: vi.fn(async () => ok({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '2.5' })), sleep: s });
    expect(s).toHaveBeenCalledWith(2500);
    const s2 = sleep();
    await fetchMessagePage('c1', 'tok', {}, { fetchFn: vi.fn(async () => ok({ 'x-ratelimit-remaining': '3', 'x-ratelimit-reset-after': '2.5' })), sleep: s2 });
    expect(s2).not.toHaveBeenCalled();
  });
});

describe('답글 대상과 웃음 수', () => {
  const page = (laugh: boolean | undefined, body: unknown[]) => fetchMessagePage('c1', 'tok', { laugh }, { fetchFn: reply(body) });

  it('답글(type 19)은 대상 메시지 ID를 담고, 일반 메시지는 null', async () => {
    const { messages } = await page(false, [msg('2', { type: 19, message_reference: { message_id: '1' } }), msg('1')]);
    expect(messages.map((m) => [m.id, m.replyTo])).toEqual([['2', '1'], ['1', null]]);
  });

  it('웃음 분석을 켜지 않으면 내용이 와도 읽지 않아 laugh는 항상 0', async () => {
    const { messages } = await page(false, [msg('1', { content: 'ㅋㅋㅋㅋㅋ' })]);
    expect(messages[0].laugh).toBe(0);
    expect((await page(undefined, [msg('1', { content: 'ㅋㅋㅋ' })])).messages[0].laugh).toBe(0);
  });

  it('웃음 분석을 켜면 ㅋ·ㅎ 글자 수만 세고(상한 30), 결과 어디에도 글 내용이 담기지 않는다', async () => {
    const out = await page(true, [msg('1', { content: '진짜 ㅋㅋㅋㅋ 웃기네 ㅎㅎ 비밀문장' }), msg('2', { content: 'ㅋ'.repeat(100) }), msg('3', {})]);
    expect(out.messages.map((m) => m.laugh)).toEqual([6, 30, 0]);
    expect(JSON.stringify(out)).not.toMatch(/비밀문장|웃기네/);
  });

  it('countLaugh: 내용이 없으면(권한 없음) 0', () => {
    expect(countLaugh(undefined)).toBe(0);
    expect(countLaugh('')).toBe(0);
    expect(countLaugh('abc')).toBe(0);
  });
});
