import { describe, expect, it, vi } from 'vitest';
import { createRiotClient, devProxyRoute, serverRoute } from './riot';

describe('route (이음새의 두 어댑터)', () => {
  it('서버 프록시: 키 없이 region/path만 보낸다', () => {
    expect(serverRoute('kr', '/lol/league/v4/entries/by-puuid/abc')).toBe(
      '/api/riot?region=kr&path=%2Flol%2Fleague%2Fv4%2Fentries%2Fby-puuid%2Fabc'
    );
    expect(serverRoute('asia', '/x', 'count=3')).toBe('/api/riot?region=asia&path=%2Fx&count=3');
  });
  it('개발 프록시: 지역별 접두사와 키를 붙인다', () => {
    expect(devProxyRoute('K')('kr', '/lol/x')).toBe('/riot-kr/lol/x?api_key=K');
    expect(devProxyRoute('K')('asia', '/lol/x', 'start=0&count=3')).toBe('/riot-asia/lol/x?api_key=K&start=0&count=3');
  });
});

describe('createRiotClient', () => {
  const fakeGet = (responses: Record<string, unknown>) =>
    vi.fn(async (_url: string, cacheKey?: string, _immutable?: boolean) => (cacheKey && cacheKey in responses ? responses[cacheKey] : null) as never);

  it('엔드포인트별 지역·캐시 키·불변 여부를 정한다', async () => {
    const get = fakeGet({});
    const riot = createRiotClient(serverRoute, get as never);
    await riot.summoner('p1');
    await riot.league('p1');
    await riot.matchIds('p1');
    await riot.match('KR_1');
    expect(get.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      ['/api/riot?region=kr&path=%2Flol%2Fsummoner%2Fv4%2Fsummoners%2Fby-puuid%2Fp1', 'summoner_p1', true],
      ['/api/riot?region=kr&path=%2Flol%2Fleague%2Fv4%2Fentries%2Fby-puuid%2Fp1', 'league_p1', undefined],
      ['/api/riot?region=asia&path=%2Flol%2Fmatch%2Fv5%2Fmatches%2Fby-puuid%2Fp1%2Fids&start=0&count=3', 'matchids_p1', undefined],
      ['/api/riot?region=asia&path=%2Flol%2Fmatch%2Fv5%2Fmatches%2FKR_1', 'match_KR_1', true],
    ]);
  });

  describe('account: 닉네임 공백 표기 차이 흡수', () => {
    const acct = { puuid: 'P', gameName: 'A B', tagLine: 'KR1' };

    it('입력 그대로 찾으면 한 번만 호출', async () => {
      const get = fakeGet({ 'puuid_AB_KR1': acct });
      expect(await createRiotClient(serverRoute, get as never).account('AB', 'KR1')).toEqual(acct);
      expect(get).toHaveBeenCalledTimes(1);
    });
    it('공백이 있는 입력은 공백 제거본으로 재시도', async () => {
      const get = fakeGet({ 'puuid_AB_KR1': acct });
      expect(await createRiotClient(serverRoute, get as never).account('A B', 'KR1')).toEqual(acct);
      expect(get.mock.calls.map((c) => c[1])).toEqual(['puuid_A B_KR1', 'puuid_AB_KR1']);
    });
    it('공백이 없는 입력은 두 번째 글자 앞에 공백을 넣어 재시도', async () => {
      const get = fakeGet({ 'puuid_A B_KR1': acct });
      expect(await createRiotClient(serverRoute, get as never).account('AB', 'KR1')).toEqual(acct);
      expect(get.mock.calls.map((c) => c[1])).toEqual(['puuid_AB_KR1', 'puuid_A B_KR1']);
    });
    it('끝까지 없으면 null', async () => {
      expect(await createRiotClient(serverRoute, fakeGet({}) as never).account('AB', 'KR1')).toBeNull();
    });
  });
});
