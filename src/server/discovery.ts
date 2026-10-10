import type { DiscoveryCard, DiscoveryFeed, DiscoveryPerson } from '../lib/discovery';
import { TITLES } from '../lib/titles';
import { listAwards, type AwardRow } from './chat/awards';
import { listHighlights, type HighlightItem } from './chat/highlights';
import { getHotMoments, type HotMoment } from './chat/moments';
import { contextualizeMoments, discoveryPeople, type DiscoveryMoment } from './discovery-context';

const PLAY: DiscoveryCard = {
  id: 'play:steam', kind: 'play', label: '같이 놀기',
  title: '오늘 할 게임, 뽑기로 정하자',
  result: '함께할 멤버를 고르고 공통 게임을 비교한 뒤, 확인된 후보에서 게임을 뽑아보세요.',
  reason: '친구들이 보유한 게임을 확인한 뒤 고를 수 있는 기존 게임 뽑기예요.',
  source: 'Steam 공통 게임 · 활동 기록이 아닌 제안', at: null,
  href: '/steam', action: '공통 게임 찾고 뽑기',
  people: [], motif: '↗', metric: '같이 할 게임', context: '편집자의 제안 · 보유 여부는 멤버 선택 후 확인',
};

// 메시지 본문이나 플레이 시간을 해석하지 않고, 기존 집계의 확인된 사실만 옮긴다.
export function buildDiscovery({ moments, highlights, awards, people = [] }: {
  moments: (HotMoment | DiscoveryMoment)[]; highlights: HighlightItem[]; awards: AwardRow[]; people?: DiscoveryPerson[];
}, now = new Date()): DiscoveryCard[] {
  const validDate = (at: string) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= now.getTime();
  const validSource = (url: string) => /^https:\/\/discord\.com\/channels\/[^/]+\/[^/]+\/[^/?#]+$/.test(url);
  const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
  const candidates: DiscoveryCard[] = [
    ...moments.filter((m): m is DiscoveryMoment => 'baseline' in m && validDate(m.at) && validSource(m.url)
      && positive(m.messages) && positive(m.people) && m.messages >= 30 && m.people >= 4
      && m.baselineSamples >= 6 && m.baseline !== null && m.baseline > 0 && m.messages >= m.baseline * 2
      && m.participants.length >= 3).map(m => ({
      id: `moment:${m.url}`, kind: 'moment' as const, label: '평소와 달랐던 순간',
      title: `평소의 ${(m.messages / m.baseline!).toFixed(1)}배로 붐빈 10분`,
      result: `${m.participants.map(p => p.name).join(' · ')}${m.people > m.participants.length ? ` 외 ${m.people - m.participants.length}명` : ''} · 함께한 ${m.people}명.`,
      reason: `같은 채널의 직전 7일, 3명 이상이 참여한 10분 구간 ${m.baselineSamples}개의 중앙값과 비교했어요. 내용은 해석하지 않아요.`,
      source: 'Discord · 참여자와 대화량 비교', at: m.at, href: m.url, action: '그 순간 보러 가기',
      people: m.participants, motif: '↗', metric: `${m.messages}개`, context: `${m.people}명이 함께한 10분`,
      comparison: { usual: m.baseline!, current: m.messages, samples: m.baselineSamples },
    })),
    ...highlights.filter(h => validDate(h.at) && validSource(h.url) && Number.isSafeInteger(h.reactions) && Number.isSafeInteger(h.replies)
      && h.reactions >= 3 && h.replies >= 2 && h.reactions + h.replies >= 8 && h.authorName.trim()).map(h => ({
      id: `highlight:${h.url}`, kind: 'highlight' as const, label: '반응이 모인 한마디',
      title: `${h.authorName}님의 한마디에 쏠린 반응`,
      result: `반응 ${h.reactions.toLocaleString()}개에 답글 ${h.replies.toLocaleString()}개.`,
      reason: '반응 3개·답글 2개 이상이 함께 모이고 합계 8개 이상인 기록이에요. 메시지 내용은 원문에서 확인해요.',
      source: 'Discord · 개념글 보관함', at: h.at, href: h.url, action: '그 한마디 보러 가기',
      people: [{ name: h.authorName, userId: h.authorUserId, image: people.find(p => p.userId === h.authorUserId)?.image ?? null }],
      motif: h.topEmoji && !h.topEmoji.startsWith('<') ? h.topEmoji : '↩',
      metric: `${h.reactions + h.replies}`, context: '반응 + 받은 답글',
    })),
  ];
  // 같은 칭호의 공동 수상자를 한 카드에 담고, 가장 최근에 끝난 주만 보여준다.
  const finishedAwards = awards.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a.week) && validDate(`${a.week}T00:00:00+09:00`) && Date.parse(`${a.week}T00:00:00+09:00`) + 7 * 86_400_000 <= now.getTime() && a.title !== 'lurker' && positive(a.value) && a.authorName.trim() && a.value >= ({ talker: 10, owl: 5, magnet: 5, oneshot: 3, replier: 10, jester: 30, laugher: 50 } as Record<string, number>)[a.title]);
  const week = finishedAwards.map(a => a.week).sort().at(-1);
  for (const key of ['owl', 'jester', 'oneshot', 'magnet', 'talker', 'replier', 'laugher'] as const) {
    const winners = finishedAwards.filter(a => a.week === week && a.title === key);
    if (!winners.length) continue;
    const title = TITLES[key];
    candidates.push({
      id: `award:${week}:${key}`, kind: 'award', label: '주간 시상식',
      title: ({ owl: '새벽 2~6시, 가장 많이 말한 사람', jester: '한마디 뒤에 터진 ㅋㅋㅋ', oneshot: '한 방으로 반응을 모은 사람', magnet: '답글을 부른 이번 주의 주인공', talker: '이번 주 수다의 주인공', replier: '답장을 가장 많이 남긴 사람', laugher: '이번 주 가장 많이 웃은 사람' })[key],
      result: winners.map(a => `${a.authorName}님 · ${a.value.toLocaleString()} ${title.unit}`).join(' / '),
      reason: `${week}에 시작한 한 주의 기록으로 선정한 칭호예요.`,
      source: 'Discord · 주간 시상식 집계', at: `${week}T00:00:00+09:00`,
      href: '/community/awards', action: '시상식 전체 보기',
      people: winners.map(a => ({ name: a.authorName, userId: a.authorUserId, image: people.find(p => p.userId === a.authorUserId)?.image ?? null })),
      motif: ({ owl: '☾', jester: 'ㅋㅋ', oneshot: '✦', magnet: '↩', talker: '…', replier: '↩', laugher: 'ㅋ' })[key],
      metric: title.label, context: winners.length > 1 ? `공동 수상 ${winners.length}명` : `${winners[0].value.toLocaleString()} ${title.unit}`, 
    });
  }
  candidates.sort((a, b) => {
    if (a.kind === 'highlight' && b.kind === 'highlight') return Number(b.metric) - Number(a.metric) || Date.parse(b.at!) - Date.parse(a.at!);
    return Date.parse(b.at!) - Date.parse(a.at!) || (a.kind === 'award' && b.kind === 'award' ? 0 : a.id.localeCompare(b.id));
  });
  const selected: DiscoveryCard[] = [];
  const sources = new Set<string>();
  // 카테고리를 번갈아 선별한다. 같은 원문은 종류가 달라도 한 번만 넣는다.
  while (selected.length < 4) {
    let added = false;
    for (const kind of ['award', 'highlight', 'moment'] as const) {
      const card = candidates.find(c => c.kind === kind && !sources.has(c.kind === 'award' ? c.id : c.href));
      if (!card) continue;
      selected.push(card);
      sources.add(card.kind === 'award' ? card.id : card.href);
      added = true;
      if (selected.length === 4) break;
    }
    if (!added) break;
  }
  return [...selected, PLAY];
}

interface DiscoverySources {
  moments: () => Promise<HotMoment[]>;
  highlights: () => ReturnType<typeof listHighlights>;
  awards: () => Promise<AwardRow[]>;
  people?: () => Promise<DiscoveryPerson[]>;
}

const defaultSources: DiscoverySources = {
  moments: async () => contextualizeMoments(await getHotMoments(5)),
  highlights: () => listHighlights(1, 10),
  awards: () => listAwards(1),
  people: discoveryPeople,
};

// 호출자가 공유·캐시한 출처를 재사용한다. 실패 처리는 출처별 캐시 밖에서 한다.
export async function getDiscoveryFeed(sources: DiscoverySources = defaultSources): Promise<DiscoveryFeed> {
  const [moments, highlights, awards, people] = await Promise.allSettled([sources.moments(), sources.highlights(), sources.awards(), sources.people?.() ?? Promise.resolve([])]);
  return {
    cards: buildDiscovery({
      moments: moments.status === 'fulfilled' ? moments.value : [],
      highlights: highlights.status === 'fulfilled' ? highlights.value.items : [],
      awards: awards.status === 'fulfilled' ? awards.value : [],
      people: people.status === 'fulfilled' ? people.value : [],
    }),
    unavailable: [moments, highlights, awards, people].some(r => r.status === 'rejected'),
  };
}
