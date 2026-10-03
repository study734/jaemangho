import { describe, expect, it } from 'vitest';
import { summarizeRoster } from './summary';
import type { Member } from '../types';

const m = (over: Partial<Member>): Member => ({
  id: 'x', gameName: 'n', tagLine: 't', summonerLevel: 1, profileIconId: 1,
  tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0, activeGame: null, matches: [], ...over,
});

describe('summarizeRoster', () => {
  it('비어 있으면 0명, 대장 없음', () => {
    expect(summarizeRoster([])).toEqual([
      { label: '등록 소환사', value: '0명' },
      { label: '전투 중 (실시간)', value: '0명', tone: 'live' },
      { label: '대장 주주', value: '없음', tone: 'highlight' },
    ]);
  });
  it('인원 수, 게임 중 인원, 최고 티어를 계산한다', () => {
    const game = { gameId: 1 } as unknown as Member['activeGame'];
    const rows = summarizeRoster([
      m({ gameName: '실버', tier: 'SILVER' }),
      m({ gameName: '다이아', tier: 'DIAMOND', activeGame: game }),
      m({ gameName: '골드', tier: 'GOLD' }),
    ]);
    expect(rows[0].value).toBe('3명');
    expect(rows[1].value).toBe('1명');
    expect(rows[2].value).toBe('다이아 (DIAMOND)');
  });
  it('모두 UNRANKED면 첫 소환사를 보여준다 (기존 동작)', () => {
    expect(summarizeRoster([m({ gameName: '첫째' }), m({ gameName: '둘째' })])[2].value).toBe('첫째 (UNRANKED)');
  });
});
