import { describe, expect, it, vi } from 'vitest';
import { RiotUnavailableError, summonerStats, type RiotGet } from './stats';

const puuid = 'p-1';
const ok = (body: unknown) => ({ status: 200, body });
function fakeRiot(overrides: Record<string, { status: number; body?: unknown }> = {}) {
  return vi.fn<RiotGet>(async (_region, path) => {
    for (const [key, value] of Object.entries(overrides)) if (path.includes(key)) return { status: value.status, body: value.body ?? {} };
    if (path.startsWith('/riot/account')) return path.endsWith('/Hide%20on%20bush/KR1') ? ok({ puuid, gameName: 'Hide on bush', tagLine: 'KR1' }) : { status: 404, body: {} };
    if (path.includes('/summoner/')) return ok({ summonerLevel: 512 });
    if (path.includes('/league/')) return ok([{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 45, wins: 12, losses: 10 }]);
    if (path.endsWith('/ids')) return ok(['KR_1', 'KR_2']);
    if (path.includes('/matches/KR_')) return ok({ info: { gameMode: 'CLASSIC', participants: [{ puuid, championName: 'Ahri', kills: 7, deaths: 2, assists: 9, win: path.endsWith('KR_1') }] } });
    if (path.includes('/spectator/')) return { status: 404, body: {} };
    throw new Error(`unexpected ${path}`);
  });
}

describe('server-side summoner stats', () => {
  it('uses the allowed web paths, shares the web match-list cache key and summarizes rank/recent/live state', async () => {
    const get = fakeRiot();
    const stats = await summonerStats('Hideonbush', 'KR1', get);
    // 공백 없는 입력은 웹과 같이 원문 -> 두 번째 글자 앞 공백 순서로 찾는다(fixture는 원래 이름만 응답)
    expect(stats).toBeNull();
    expect(get).toHaveBeenCalledWith('asia', '/riot/account/v1/accounts/by-riot-id/H%20ideonbush/KR1', undefined);
    get.mockClear();
    const found = await summonerStats('Hide on bush', 'KR1', get);
    expect(get).toHaveBeenCalledWith('asia', `/lol/match/v5/matches/by-puuid/${puuid}/ids`, { count: '3', start: '0' });
    expect(found).toEqual({ gameName: 'Hide on bush', tagLine: 'KR1', level: 512, flex: null, inGame: false, failures: [],
      solo: { tier: 'GOLD', rank: 'II', leaguePoints: 45, wins: 12, losses: 10 },
      recent: [{ win: true, champion: 'Ahri', kills: 7, deaths: 2, assists: 9, mode: 'CLASSIC' }, { win: false, champion: 'Ahri', kills: 7, deaths: 2, assists: 9, mode: 'CLASSIC' }] });
  });
  it('returns null for unknown Riot IDs and fails on key/limit errors instead of showing empty data', async () => {
    expect(await summonerStats('Nobody', 'KR1', fakeRiot())).toBeNull();
    await expect(summonerStats('Hide on bush', 'KR1', fakeRiot({ '/league/': { status: 429 } }))).rejects.toEqual(new RiotUnavailableError(429));
    await expect(summonerStats('Hide on bush', 'KR1', fakeRiot({ '/riot/account': { status: 403 } }))).rejects.toBeInstanceOf(RiotUnavailableError);
  });
  it('keeps rank when matches or live game fail, and marks them as failures', async () => {
    const stats = await summonerStats('Hide on bush', 'KR1', fakeRiot({ '/ids': { status: 500 }, '/spectator/': { status: 503 } }));
    expect(stats).toMatchObject({ solo: { tier: 'GOLD' }, recent: [], inGame: null, failures: ['activeGame', 'matches'] });
  });
});
