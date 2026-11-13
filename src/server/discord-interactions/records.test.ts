import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAwards, awardsForUser } from '../chat/awards';
import { listHighlights } from '../chat/highlights';
import { getHotMoments } from '../chat/moments';
import { getPerson } from '../people';
import { commandUser } from './access';
import { memberProfile, records } from './records';

vi.mock('../chat/awards', () => ({ listAwards: vi.fn(), awardsForUser: vi.fn() }));
vi.mock('../chat/highlights', () => ({ listHighlights: vi.fn() }));
vi.mock('../chat/moments', () => ({ getHotMoments: vi.fn() }));
vi.mock('../people', () => ({ getPerson: vi.fn() }));
vi.mock('./access', () => ({ commandUser: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('/기록', () => {
  it('distinguishes empty records from data and escapes member names', async () => {
    vi.mocked(listAwards).mockResolvedValue([]);
    expect((await records('시상식')).content).toContain('아직 계산된');
    vi.mocked(listAwards).mockResolvedValue([{ week: '2026-11-02', title: 'talker', authorName: '*bold*', authorUserId: null, value: 1234 },
      { week: '2026-11-02', title: 'lurker', authorName: 'quiet', authorUserId: null, value: 0 }]);
    const awards = (await records('시상식')).content;
    expect(listAwards).toHaveBeenCalledWith(1);
    expect(awards).toContain('11월 2일부터 한 주의 시상식');
    expect(awards).toContain('**수다 갤러** \\*bold\\* — 메시지 1,234');
    expect(awards).toContain('**눈팅러** quiet\n');
  });
  it('links highlights and hot moments to the original Discord messages', async () => {
    vi.mocked(listHighlights).mockResolvedValue({ total: 7, pages: 1, items: [{ url: 'https://discord.com/channels/1/2/3', authorName: 'A', authorUserId: null, reactions: 4, replies: 2, topEmoji: '🔥', at: '2026-11-10T03:00:00Z' }] });
    expect((await records('개념글')).content).toContain('🔥 4 · 💬 2 · [A님의 메시지](https://discord.com/channels/1/2/3) · 11월 10일');
    expect(listHighlights).toHaveBeenCalledWith(1, 5);
    vi.mocked(getHotMoments).mockResolvedValue([]);
    expect((await records('순간')).content).toContain('없었어요');
    vi.mocked(getHotMoments).mockResolvedValue([{ url: 'https://discord.com/channels/1/2/4', at: '2026-11-10T13:05:00Z', messages: 42, people: 5 }]);
    expect((await records('순간')).content).toContain('10분 동안 5명이 42개');
  });
});

describe('/멤버', () => {
  it('shows linked accounts and titles only for registered, unbanned members', async () => {
    vi.mocked(commandUser).mockResolvedValue(null);
    expect((await memberProfile('100000000000000004')).content).toContain('가입한 멤버만');
    expect(getPerson).not.toHaveBeenCalled();
    vi.mocked(commandUser).mockResolvedValue('u1');
    vi.mocked(getPerson).mockResolvedValue({ id: 'u1', name: 'Friend', image: null, lastLogin: '2026-11-12T00:00:00Z',
      lol: [{ id: 'l', gameName: 'Hide on bush', tagLine: 'KR1' }], steam: [] });
    vi.mocked(awardsForUser).mockResolvedValue([{ title: 'owl', count: 3, lastWeek: '2026-11-02' }]);
    const content = (await memberProfile('100000000000000004')).content;
    expect(content).toContain('롤: Hide on bush#KR1');
    expect(content).toContain('Steam: 연결된 계정 없음');
    expect(content).toContain('새벽 갤러 3회');
    expect(content).toContain('/people/u1');
  });
});
