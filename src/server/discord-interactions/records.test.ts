import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAwards, awardsForUser } from '../chat/awards';
import { listHighlights } from '../chat/highlights';
import { getHotMoments } from '../chat/moments';
import { getPerson } from '../people';
import { commandUser } from './access';
import { reportFailure } from '../diagnostics';
import { memberProfile, records } from './records';

vi.mock('../chat/awards', () => ({ listAwards: vi.fn(), awardsForUser: vi.fn() }));
vi.mock('../chat/highlights', () => ({ listHighlights: vi.fn() }));
vi.mock('../chat/moments', () => ({ getHotMoments: vi.fn() }));
vi.mock('../people', () => ({ getPerson: vi.fn() }));
vi.mock('./access', () => ({ commandUser: vi.fn() }));
vi.mock('../diagnostics', () => ({ reportFailure: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('/기록', () => {
  const fill = () => {
    vi.mocked(listAwards).mockResolvedValue([{ week: '2026-11-02', title: 'talker', authorName: '*bold*', authorUserId: null, value: 1234 },
      { week: '2026-11-02', title: 'lurker', authorName: 'quiet', authorUserId: null, value: 0 }]);
    vi.mocked(listHighlights).mockResolvedValue({ total: 7, pages: 1, items: [{ url: 'https://discord.com/channels/1/2/3', authorName: 'A', authorUserId: null, reactions: 4, replies: 2, topEmoji: '🔥', at: '2026-11-10T03:00:00Z' }] });
    vi.mocked(getHotMoments).mockResolvedValue([{ url: 'https://discord.com/channels/1/2/4', at: '2026-11-10T13:05:00Z', messages: 42, people: 5 }]);
  };
  it('shows awards, highlights and hot moments together in one message without a choice step', async () => {
    fill();
    const content = (await records()).content;
    expect(listAwards).toHaveBeenCalledWith(1); expect(listHighlights).toHaveBeenCalledWith(1, 5); expect(getHotMoments).toHaveBeenCalledWith(5);
    expect(content).toMatch(/주간 시상식[\s\S]*개념글[\s\S]*뜨거웠던 순간/);
    expect(content).toContain('11월 2일부터 한 주');
    expect(content).toContain('**수다 갤러** \\*bold\\* · 메시지 1,234');
    expect(content).toContain('**눈팅러** quiet\n');
    expect(content).toContain('🔥 4 · 💬 2 · [A님의 메시지](https://discord.com/channels/1/2/3) · 11월 10일');
    expect(content).toContain('10분 동안 5명이 42개');
    expect(content.length).toBeLessThanOrEqual(2000);
  });
  it('distinguishes empty sections from failed ones and keeps the rest', async () => {
    fill();
    vi.mocked(listAwards).mockResolvedValue([]);
    vi.mocked(getHotMoments).mockRejectedValue(new Error('secret-db-detail'));
    const content = (await records()).content;
    expect(content).toContain('아직 계산된 주간 시상식이 없어요');
    expect(content).toContain('[A님의 메시지]');
    expect(content).toMatch(/뜨거웠던 순간[^\n]*\n불러오지 못했어요/);
    expect(reportFailure).toHaveBeenCalledWith('chat.discord.moments', expect.any(Error));
    expect(content).not.toContain('secret-db-detail');
  });
  it('stays within the Discord limit with long names', async () => {
    fill();
    vi.mocked(listHighlights).mockResolvedValue({ total: 5, pages: 1, items: Array.from({ length: 5 }, (_, i) => ({ url: `https://discord.com/channels/100000000000000002/100000000000000003/10000000000000000${i}`, authorName: '긴이름'.repeat(40), authorUserId: null, reactions: 99, replies: 99, topEmoji: '🔥', at: '2026-11-10T03:00:00Z' })) });
    expect((await records()).content.length).toBeLessThanOrEqual(2000);
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
