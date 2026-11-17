import { describe, expect, it } from 'vitest';
import { rankImprovements, type ImprovementInput } from './improvements';

const empty: ImprovementInput = { views: [], failures: [], riotErrors: [], steamErrors: [], chatJobs: { failed: 0, partial: 0 }, alerts: [] };
const input = (patch: Partial<ImprovementInput>): ImprovementInput => ({ ...empty, ...patch });
const kinds = (r: ReturnType<typeof rankImprovements>) => r.items.map((i) => i.id);

describe('rankImprovements', () => {
  it('returns nothing and no usage judgement when there is no data', () => {
    const report = rankImprovements(empty);
    expect(report).toEqual({ usageEnough: false, totalViews: { current: 0, previous: 0 }, items: [] });
  });

  it('groups server failures by area and ranks alerts first', () => {
    const report = rankImprovements(input({
      failures: [
        { operation: 'api/steam/games.GET', code: 'unexpected', count: 4 },
        { operation: 'home.feed', code: '57014', count: 2 },
        { operation: 'riot.upstream', code: 'http_503', count: 50 }, // riot_errors에서 세므로 제외
        { operation: 'mystery.job', code: 'unexpected', count: 1 },
      ],
      alerts: [{ key: 'chat.stale', title: '채팅 동기화 성공 기록이 없습니다.', severity: 'warning' }],
    }));
    expect(kinds(report)).toEqual(['fix:records', 'fix:steam', 'fix:ops']);
    expect(report.items[0].reasons).toEqual(['경고: 채팅 동기화 성공 기록이 없습니다.', '서버 실패 2회 · home.feed(57014) 2회']);
    expect(report.items[1].reasons[0]).toBe('서버 실패 4회 · api/steam/games.GET(unexpected) 4회');
    expect(report.items.find((i) => i.id === 'fix:lol')).toBeUndefined();
  });

  it('separates Riot key, rate limit and upstream errors and ignores 404', () => {
    const report = rankImprovements(input({ riotErrors: [{ status: 404, count: 99 }, { status: 403, count: 2 }, { status: 429, count: 3 }, { status: 503, count: 1 }] }));
    expect(report.items).toHaveLength(1);
    expect(report.items[0].reasons).toEqual(['Riot 키 오류(401/403) 2회', 'Riot 호출 제한(429) 3회', 'Riot 서버 오류(5xx) 1회 · 외부 서비스 문제일 수 있음']);
    expect(rankImprovements(input({ riotErrors: [{ status: 404, count: 5 }] })).items).toEqual([]);
  });

  it('breaks equal fix scores by usage', () => {
    const report = rankImprovements(input({
      views: [{ path: '/steam', current: 40, previous: 40 }, { path: '/lol', current: 5, previous: 5 }],
      failures: [{ operation: 'api/riot.GET', code: 'unexpected', count: 1 }, { operation: 'steam.taste.GET', code: 'unexpected', count: 1 }],
    }));
    expect(kinds(report).slice(0, 2)).toEqual(['fix:steam', 'fix:lol']);
    expect(report.items[0].views).toBe(40);
  });

  it('flags declining, growing and unused screens only with enough views', () => {
    const views = [
      { path: '/steam', current: 6, previous: 20 },
      { path: '/lol', current: 30, previous: 10 },
      { path: '/', current: 50, previous: 48 },
      { path: '/admin', current: 0, previous: 0 },
    ];
    const report = rankImprovements(input({ views }));
    expect(report.usageEnough).toBe(true);
    expect(report.items.find((i) => i.id === 'check:/steam')?.reasons).toEqual(['열람 20회 → 6회 (-70%)']);
    expect(report.items.find((i) => i.id === 'grow:/lol')?.reasons).toEqual(['열람 10회 → 30회 (+200%)']);
    expect(report.items.some((i) => i.id === 'check:/' || i.id === 'grow:/')).toBe(false);
    expect(report.items.some((i) => i.id === 'review:/lol/mastery')).toBe(true);
    expect(report.items.some((i) => i.target === '관리자')).toBe(false);

    const few = rankImprovements(input({ views: [{ path: '/steam', current: 3, previous: 20 }] }));
    expect(few.usageEnough).toBe(false);
    expect(few.items).toEqual([]);
  });

  it('2026-11 운영 보고 재현: DB 다시 시도는 실패가 아닌 살펴보기 한 항목, 웹 전체 미사용은 한 항목으로 묶는다', () => {
    const views = [
      { path: '/', current: 0, previous: 20 }, { path: '/steam', current: 0, previous: 5 }, { path: '/lol', current: 0, previous: 3 },
      { path: '/memories', current: 0, previous: 2 },
    ];
    const report = rankImprovements(input({
      views,
      failures: [{ operation: 'db.connect-retry', code: 'recovered', count: 3 }],
      steamErrors: [{ code: 'timeout', count: 3 }],
    }));
    expect(kinds(report)).toEqual(['fix:steam', 'check:db-retry', 'review:web']);
    expect(report.items.find((i) => i.id === 'fix:ops')).toBeUndefined();
    expect(report.items[0].next).toContain('timeout·http_5xx는 Steam 쪽');
    expect(report.items[1].reasons).toEqual(['새 연결 시간 초과 후 다시 시도로 회복 3회 · 사용자 오류 없이 10초 이상 대기']);
    expect(report.items[2].reasons[0]).toBe('최근 7일 열람 0회(그 전 7일 30회)');
    expect(report.items[2].reasons[1]).toContain('듀오 시너지');
    expect(report.items[2].reasons[1]).not.toContain('홈');
    expect(report.items.some((i) => i.id.startsWith('review:/') || i.id.startsWith('check:/'))).toBe(false);
  });

  it('DB 다시 시도와 진짜 서버 실패가 함께 있으면 실패만 고치기로 센다', () => {
    const report = rankImprovements(input({ failures: [
      { operation: 'db.connect-retry', code: 'recovered', count: 9 }, { operation: 'mystery.job', code: 'unexpected', count: 1 },
    ] }));
    expect(kinds(report)).toEqual(['fix:ops', 'check:db-retry']);
    expect(report.items[0].reasons).toEqual(['서버 실패 1회 · mystery.job(unexpected) 1회']);
  });
});
