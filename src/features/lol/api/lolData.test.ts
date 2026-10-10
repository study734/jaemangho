import { describe, expect, it, vi } from 'vitest';
import { createLolData } from './lolData';
import type { RiotClient } from './riot';

const account = { puuid: 'P', gameName: '정식이름', tagLine: 'KR1' };
const league = [{ queueType: 'RANKED_SOLO_5x5', tier: 'PLATINUM', rank: 'IV', leaguePoints: 12, wins: 3, losses: 4 }];

// 필요한 응답만 덮어쓰는 가짜 Riot 클라이언트 (기본: 모두 "없음")
const fakeRiot = (over: Partial<RiotClient> = {}): RiotClient => ({
  account: async () => account,
  summoner: async () => ({ id: 'S', summonerLevel: 321, profileIconId: 77 }),
  league: async () => league,
  mastery: async () => [],
  matchIds: async () => [],
  match: async () => null,
  activeGame: async () => null,
  ...over,
});

describe('lookup / overview', () => {
  it('소환사 응답을 기다리는 동안 랭크 요청도 시작한다', async () => {
    let finish!: (value: { id: string; summonerLevel: number; profileIconId: number }) => void;
    const leagueRequest = vi.fn(async () => league);
    const lol = createLolData(fakeRiot({
      summoner: () => new Promise(resolve => { finish = resolve; }), league: leagueRequest,
    }));
    const pending = lol.overview({ gameName: 'a', tagLine: 'b' });
    await Promise.resolve();
    expect(leagueRequest).toHaveBeenCalledTimes(1);
    finish({ id: 'S', summonerLevel: 321, profileIconId: 77 });
    expect(await pending).toMatchObject({ tier: 'PLATINUM' });
  });
  it('lookup: 정식 Riot ID와 기본 정보를 합쳐 돌려준다', async () => {
    const s = await createLolData(fakeRiot()).lookup('입력', 'kr1');
    expect(s).toEqual({
      gameName: '정식이름', tagLine: 'KR1', summonerLevel: 321, profileIconId: 77,
      tier: 'PLATINUM', rank: 'IV', leaguePoints: 12, wins: 3, losses: 4,
    });
  });
  it('overview: 랭크 기록이 없어도 UNRANKED로 돌려준다', async () => {
    const o = await createLolData(fakeRiot({ league: async () => null })).overview({ gameName: 'a', tagLine: 'b' });
    expect(o).toMatchObject({ summonerLevel: 321, tier: 'UNRANKED', rank: '' });
  });
  it('계정이 없으면 기존과 같은 문구로 예외', async () => {
    const lol = createLolData(fakeRiot({ account: async () => null }));
    await expect(lol.lookup('없음', 'KR9')).rejects.toThrow('존재하지 않는 Riot ID입니다 (HTTP 404). 소환사명(없음)과 태그(#KR9)');
    await expect(lol.overview({ gameName: '없음', tagLine: 'KR9' })).rejects.toThrow('존재하지 않는 Riot ID');
  });
  it('소환사 상세가 없으면 예외', async () => {
    const lol = createLolData(fakeRiot({ summoner: async () => null }));
    await expect(lol.overview({ gameName: 'a', tagLine: 'b' })).rejects.toThrow('소환사 상세조회 실패');
  });
});

describe('details', () => {
  const member = { gameName: 'a', tagLine: 'b' };
  const matchOf = (id: string) => ({ info: { participants: [{ puuid: 'P', championName: id, win: true }] } });

  it('계정을 못 찾으면 null', async () => {
    expect(await createLolData(fakeRiot({ account: async () => null })).details(member)).toBeNull();
  });
  it('숙련도·매치·실시간 게임을 모아 돌려준다', async () => {
    const lol = createLolData(
      fakeRiot({
        mastery: async () => [{ championId: 103, championLevel: 7, championPoints: 9, lastPlayTime: 1 }],
        matchIds: async () => ['KR_1', 'KR_2'],
        match: async (id) => matchOf(id),
        activeGame: async () => ({
          gameId: 1, gameLength: 5, gameStartTime: 2, mapId: 11, gameMode: 'CLASSIC',
          participants: [{ puuid: 'P', teamId: 100, championId: 103 }],
        }),
      })
    );
    const d = (await lol.details(member))!;
    expect(d.championMasteries[0].championName).toBe('Ahri');
    expect(d.matches.map((m) => m.matchId)).toEqual(['KR_1', 'KR_2']);
    expect(d.activeGame?.championName).toBe('Ahri');
  });
  it('매치 상세 요청을 함께 시작하고 응답 완료 순서와 관계없이 최근 순서를 유지한다', async () => {
    let finishFirst!: (value: ReturnType<typeof matchOf>) => void;
    const match = vi.fn((id: string) => id === 'KR_1'
      ? new Promise<ReturnType<typeof matchOf>>(resolve => { finishFirst = resolve; })
      : Promise.resolve(matchOf(id)));
    const pending = createLolData(fakeRiot({ matchIds: async () => ['KR_1', 'KR_2'], match })).details(member);
    await vi.waitFor(() => expect(match).toHaveBeenCalledTimes(2));
    finishFirst(matchOf('KR_1'));
    expect((await pending)?.matches.map(history => history.matchId)).toEqual(['KR_1', 'KR_2']);
  });
  it('일부가 실패해도 나머지는 돌려준다 (부분 실패 허용)', async () => {
    const lol = createLolData(
      fakeRiot({
        mastery: async () => { throw new Error('boom'); },
        matchIds: async () => ['KR_1', 'KR_2'],
        match: async (id) => { if (id === 'KR_1') throw new Error('boom'); return matchOf(id); },
        activeGame: async () => { throw new Error('boom'); },
      })
    );
    const d = (await lol.details(member))!;
    expect(d.championMasteries).toEqual([]);
    expect(d.matches.map((m) => m.matchId)).toEqual(['KR_2']);
    expect(d.activeGame).toBeNull();
  });
});
