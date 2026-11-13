import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAwards, awardsForUser } from '../chat/awards';
import { listHighlights } from '../chat/highlights';
import { getHotMoments } from '../chat/moments';
import { getPerson } from '../people';
import { summonerRank } from '../lol/stats';
import { topPlayed } from '../steam/games';
import { commandUser } from './access';
import { reportFailure } from '../diagnostics';
import { memberProfile, records } from './records';

vi.mock('../chat/awards', () => ({ listAwards: vi.fn(), awardsForUser: vi.fn() }));
vi.mock('../chat/highlights', () => ({ listHighlights: vi.fn() }));
vi.mock('../chat/moments', () => ({ getHotMoments: vi.fn() }));
vi.mock('../people', () => ({ getPerson: vi.fn() }));
vi.mock('../lol/stats', () => ({ summonerRank: vi.fn() }));
vi.mock('../steam/games', () => ({ topPlayed: vi.fn() }));
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
    expect(content).toContain('**11월 2일(월) ~ 11월 8일(일)**');
    expect(content).toContain('🗣️ 수다 갤러 — **\\*bold\\***\n-# 메시지 1,234개 · 가장 말을 많이 한 사람');
    expect(content).toContain('👀 눈팅러 — **quiet**\n-# 접속은 했는데');
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
    expect(content).toMatch(/뜨거웠던 순간\n-# [^\n]*\n불러오지 못했어요/);
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
  const person = { id: 'u1', name: 'Friend', image: null, lastLogin: '2026-11-12T00:00:00Z',
    lol: [{ id: 'l1', gameName: 'Hide on bush', tagLine: 'KR1' }, { id: 'l2', gameName: 'Gone', tagLine: 'KR1' }, { id: 'l3', gameName: 'Third', tagLine: 'KR1' }],
    steam: [{ steamId: '76561190000000001', name: 'SteamFriend', avatar: null }, { steamId: '76561190000000002', name: 'Private', avatar: null }] };
  beforeEach(() => {
    vi.mocked(commandUser).mockResolvedValue('u1');
    vi.mocked(getPerson).mockResolvedValue(person);
    vi.mocked(awardsForUser).mockResolvedValue([{ title: 'owl', count: 3, lastWeek: '2026-11-02' }]);
    vi.mocked(summonerRank).mockImplementation(async name => name === 'Gone' ? null : { solo: { tier: 'GOLD', rank: 'II', leaguePoints: 45, wins: 1, losses: 1 }, flex: null });
    vi.mocked(topPlayed).mockImplementation(async id => id.endsWith('1') ? [{ name: 'Lethal', minutes: 600 }, { name: 'Valheim', minutes: 120 }] : null);
  });
  it('only shows registered, unbanned members', async () => {
    vi.mocked(commandUser).mockResolvedValue(null);
    expect((await memberProfile('100000000000000004')).content).toContain('가입한 멤버만');
    expect(getPerson).not.toHaveBeenCalled(); expect(summonerRank).not.toHaveBeenCalled();
  });
  it('shows rank and most-played games per account like the site profile, at most two accounts each', async () => {
    const content = (await memberProfile('100000000000000004')).content;
    expect(content).toContain('Hide on bush#KR1 · 솔로 골드 II 45LP');
    expect(content).toContain('Gone#KR1 · 계정을 찾지 못했어요');
    expect(content).not.toContain('Third#KR1'); expect(content).toContain('외 1개 계정');
    expect(summonerRank).toHaveBeenCalledTimes(2);
    expect(topPlayed).toHaveBeenCalledWith('76561190000000001', 3);
    expect(content).toContain('SteamFriend · Lethal 10시간, Valheim 2시간');
    expect(content).toContain('Private · 게임 목록이 비공개이거나 불러오지 못했어요');
    expect(content).toContain('🌙 새벽 갤러 3회');
    expect(content).toContain('(<https://www.jaemangho.shop/people/u1>)');
  });
  it('keeps the rest when one lookup fails, and marks the failed part', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(summonerRank).mockRejectedValue(new Error('riot-secret'));
    vi.mocked(awardsForUser).mockRejectedValue(new Error('db'));
    const content = (await memberProfile('100000000000000004')).content;
    expect(content).toContain('Hide on bush#KR1 · 랭크를 불러오지 못했어요');
    expect(content).toContain('칭호를 불러오지 못했어요');
    expect(content).toContain('SteamFriend · Lethal');
    expect(reportFailure).toHaveBeenCalledWith('profile.discord.rank', expect.any(Error));
    expect(content).not.toContain('riot-secret');
  });
});
