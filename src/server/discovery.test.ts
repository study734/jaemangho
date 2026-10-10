import { describe, expect, it, vi } from 'vitest';
import { buildDiscovery, getDiscoveryFeed } from './discovery';
import type { DiscoveryMoment } from './discovery-context';
import type { HighlightItem } from './chat/highlights';
import type { AwardRow } from './chat/awards';

vi.mock('./chat/moments', () => ({ getHotMoments: vi.fn() }));
vi.mock('./chat/highlights', () => ({ listHighlights: vi.fn() }));
vi.mock('./chat/awards', () => ({ listAwards: vi.fn() }));
vi.mock('./discovery-context', () => ({ contextualizeMoments: vi.fn(async m => m), discoveryPeople: vi.fn(async () => []) }));
import { getHotMoments } from './chat/moments';
import { listHighlights } from './chat/highlights';
import { listAwards } from './chat/awards';

const now = new Date('2026-10-10T09:00:00Z');
const url = (n: number) => `https://discord.com/channels/1/2/${n}`;
const moment = (n: number): DiscoveryMoment => ({ url: url(n), at: '2026-10-09T09:00:00Z', messages: 40, people: 4, baseline: 12, baselineSamples: 8, participants: ['선장', '친구', '항해'].map(name => ({ name, userId: null, image: null })) });
const highlight = (n: number): HighlightItem => ({ url: url(n), at: '2026-10-08T09:00:00Z', authorName: '친구', authorUserId: null, reactions: 5, replies: 3, topEmoji: null });
const award: AwardRow = { week: '2026-09-28', title: 'owl', authorName: '친구', authorUserId: null, value: 12 };

describe('발견 선별', () => {
  it('같은 원문을 중복하지 않고 종류를 섞어 최대 5개에서 끝난다', () => {
    const cards = buildDiscovery({ moments: [moment(1), moment(2), moment(3)], highlights: [highlight(1), highlight(4), highlight(5)], awards: [award] }, now);
    expect(cards).toHaveLength(5);
    expect(cards.map(c => c.kind)).toEqual(['award', 'highlight', 'moment', 'highlight', 'play']);
    expect(cards.filter(c => c.href === url(1))).toHaveLength(1);
    expect(cards.find(c => c.kind === 'moment')?.result).toContain('선장');
    expect(cards.at(-1)?.at).toBeNull();
  });

  it('미래 날짜, 조회 불가능한 출처와 기준 미달 수치를 사건으로 만들지 않는다', () => {
    const cards = buildDiscovery({ moments: [{ ...moment(1), messages: 9 }, { ...moment(2), people: 2 }, { ...moment(3), at: '2027-01-01' }, { ...moment(4), url: 'https://discord.com/channels//2/4' }], highlights: [{ ...highlight(5), reactions: -1 }, { ...highlight(6), replies: 0, reactions: 1 }], awards: [{ ...award, week: '2026-10-05' }] }, now);
    expect(cards.map(c => c.kind)).toEqual(['play']);
  });

  it('보관된 기록은 실제 날짜를 유지하며 최신 완료 주의 공동 수상자는 한 카드에 담는다', () => {
    const cards = buildDiscovery({ moments: [], highlights: [{ ...highlight(1), at: '2025-01-01T00:00:00Z' }], awards: [award, { ...award, authorName: '다른 친구' }, { ...award, week: '2026-09-21', authorName: '이전 수상자' }] }, now);
    expect(cards.find(c => c.kind === 'highlight')?.at).toBe('2025-01-01T00:00:00Z');
    const winner = cards.find(c => c.kind === 'award');
    expect(winner?.result).toContain('다른 친구');
    expect(winner?.result).not.toContain('이전 수상자');
  });

  it('평범한 통계, 부족한 비교 표본과 낮은 참여 기록은 발견에서 제외한다', () => {
    const cards = buildDiscovery({ moments: [
      { ...moment(1), messages: 12 }, { ...moment(2), baselineSamples: 5 },
      { ...moment(3), baseline: 25 }, { ...moment(4), participants: [] },
      { ...moment(5), baseline: null },
    ], highlights: [{ ...highlight(6), reactions: 3, replies: 2 }, { ...highlight(7), reactions: 20, replies: 0 }], awards: [{ ...award, value: 1 }] }, now);
    expect(cards.map(c => c.kind)).toEqual(['play']);
  });

  it('확인된 얼굴과 비교 기준을 전달하고 새벽 칭호를 우선한다', () => {
    const cards = buildDiscovery({ moments: [moment(1)], highlights: [], awards: [
      { ...award, title: 'talker', value: 40 }, { ...award, authorUserId: 'friend' },
    ], people: [{ userId: 'friend', name: '현재 닉네임', image: '/avatar.webp' }] }, now);
    expect(cards[0].title).toBe('새벽 2~6시, 가장 많이 말한 사람');
    expect(cards[0].people[0]).toEqual({ name: '친구', userId: 'friend', image: '/avatar.webp' });
    expect(cards.find(c => c.kind === 'moment')?.comparison).toEqual({ usual: 12, current: 40, samples: 8 });
  });

  it('데이터가 없으면 활동을 꾸미지 않고 게임 제안 하나를 보여준다', () => {
    expect(buildDiscovery({ moments: [], highlights: [], awards: [] }, now).map(c => c.kind)).toEqual(['play']);
  });
});

describe('발견 조회', () => {
  it('호출자가 공유한 출처를 사용하고 한 출처가 복구되면 바로 정상 상태로 돌아온다', async () => {
    const moments = vi.fn<() => Promise<DiscoveryMoment[]>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([moment(1)]);
    const sources = { moments, highlights: async () => ({ items: [], total: 0, pages: 1 }), awards: async () => [] };
    const failed = await getDiscoveryFeed(sources);
    const recovered = await getDiscoveryFeed(sources);
    expect(failed.unavailable).toBe(true);
    expect(failed.cards.map(c => c.kind)).toEqual(['play']);
    expect(recovered.unavailable).toBe(false);
    expect(recovered.cards.map(c => c.kind)).toEqual(['moment', 'play']);
  });

  it('하나의 조회가 실패해도 다른 출처의 기록을 유지하고 실패 상태를 전달한다', async () => {
    vi.mocked(getHotMoments).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(listHighlights).mockResolvedValueOnce({ items: [highlight(1)], total: 1, pages: 1 });
    vi.mocked(listAwards).mockResolvedValueOnce([]);
    const feed = await getDiscoveryFeed();
    expect(feed.unavailable).toBe(true);
    expect(feed.cards.map(c => c.kind)).toEqual(['highlight', 'play']);
  });

  it('정상적인 빈 집계는 조회 실패로 표시하지 않는다', async () => {
    vi.mocked(getHotMoments).mockResolvedValueOnce([]);
    vi.mocked(listHighlights).mockResolvedValueOnce({ items: [], total: 0, pages: 1 });
    vi.mocked(listAwards).mockResolvedValueOnce([]);
    expect((await getDiscoveryFeed()).unavailable).toBe(false);
  });
});
