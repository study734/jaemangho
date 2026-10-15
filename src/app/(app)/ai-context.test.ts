import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../../features/lol';
import type { GamesSnapshot } from '../../features/steam';
import { contextSchema } from '../../server/ai/context';
import { parseAnalysis } from '../../server/ai/input';
vi.mock('@/features/lol', () => import('../../features/lol'));
import { lolContext, steamContext } from './ai-context';

const member = (name: string, tagLine: string): Member => ({
  id: 'private-id', gameName: name, tagLine, summonerLevel: 100, profileIconId: 1,
  tier: 'GOLD', rank: 'I', leaguePoints: 20, wins: 10, losses: 8, activeGame: null, matches: [],
});
describe('AI display projections', () => {
  it('accepts a full 40-player snapshot within the HTTP byte budget', async () => {
    const members = Array.from({ length: 40 }, (_, i) => ({ ...member(`친구${i}`, 'KR1'), tier: 'GRANDMASTER', wins: 1000, losses: 1000,
      matches: Array.from({ length: 10 }, () => ({ matchId: 'KR_1', gameMode: 'CLASSIC', gameDuration: 1800, gameCreation: 1,
        championName: '아우렐리온 솔', kills: 10, deaths: 8, assists: 20, win: true, cs: 200, gold: 10000, items: [], allPlayers: [] })),
      championMasteries: Array.from({ length: 5 }, () => ({ championId: 1, championName: '아우렐리온 솔', championPoints: 1000000, championLevel: 10, lastPlayTime: 1 })),
    }));
    const body = JSON.stringify({ context: lolContext(members, 'overview'), question: '' });
    expect(Buffer.byteLength(body)).toBeGreaterThan(64000);
    const parsed = await parseAnalysis(new Request('https://example.com/api/ai', { method: 'POST', body }));
    expect(parsed.ok).toBe(true);
  });
  it('anonymizes full Riot identities and deduplicates actual duo games', () => {
    const members = [member('private_same_name', 'private_tag1'), member('private_same_name', 'private_tag2')];
    const match = { matchId: 'private_match', gameMode: 'CLASSIC', gameDuration: 100, gameCreation: 1,
      championName: 'Ahri', kills: 3, deaths: 2, assists: 5, win: true, cs: 10, gold: 100, items: [],
      allPlayers: members.map(m => ({ gameName: m.gameName, tagLine: m.tagLine, win: true, kills: 3, deaths: 2, assists: 5,
        championName: 'Ahri', championId: 103, totalMinionsKilled: 10, goldEarned: 100, itemIds: [] })) };
    members.forEach(m => { m.matches = [match]; });
    const data = contextSchema.parse(lolContext(members, 'synergy'));
    expect(JSON.stringify(data)).not.toContain('private_');
    expect(data).toMatchObject({ duos: [{ pair: '플레이어 1 & 플레이어 2', games: 1, wins: 1 }], players: [{ detailsLoaded: false }, { detailsLoaded: false }] });
  });
  it('only sends filtered Steam candidates and aggregate failure counts', () => {
    const snapshot = { query: 'Portal', result: null, missionResult: null,
      recommendations: { ids: ['private-id1', 'private-id2'], scope: 'any', preference: 'fresh', data: {
        games: [{ name: 'Portal 2', appId: 620, totalMinutes: 60, owners: 1, score: 50, support: 'coop', minMinutes: 60, maxMinutes: 60,
          missingIds: ['private-id2'], reasons: ['private-reason'] }, { name: 'Other', appId: 1, totalMinutes: 0 }],
        excluded: [], unverified: 2, recentUnavailable: ['private-id2'],
      } },
    } as unknown as GamesSnapshot;
    const data = contextSchema.parse(steamContext(snapshot));
    expect(JSON.stringify(data)).not.toContain('private-');
    expect(data).toMatchObject({ games: [{ name: 'Portal 2', owners: 1 }], unverified: 2, recentUnavailable: 1, people: 2 });
    expect(data.topic === 'steam' && data.games).toHaveLength(1);
    expect(steamContext({ ...snapshot, recommendations: null })).toBeNull();
  });
});
