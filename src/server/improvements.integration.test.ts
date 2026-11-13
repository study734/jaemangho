import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('개선 우선순위 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  const cleanup = async () => {
    await pool.query(`delete from app_failures`);
    await pool.query(`delete from page_views`);
    await pool.query(`delete from riot_errors`); // 다른 테스트가 남긴 외부 오류가 순위에 섞이지 않게 비운다
    await pool.query(`delete from steam_errors`);
    await pool.query(`delete from ops_alerts`);
    await pool.query(`delete from ops_jobs where job = 'chat'`);
  };
  beforeAll(async () => { pool = await openTestDb(); await cleanup(); });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('reportFailure가 작업·분류별 횟수를 쌓고 database.* 는 세지 않는다', async () => {
    const { writeFailureCount, shouldCount } = await import('./failure-stats');
    await writeFailureCount('steam.taste.GET', 'unexpected');
    await writeFailureCount('steam.taste.GET', 'unexpected');
    expect(shouldCount('database.query')).toBe(false);
    const rows = (await pool.query(`select operation, code, count from app_failures`)).rows;
    expect(rows).toEqual([{ operation: 'steam.taste.GET', code: 'unexpected', count: 2 }]);
  });

  it('열람·실패·외부 오류·경고를 기간에 맞춰 모아 순위를 만든다', async () => {
    await pool.query(`insert into page_views (day, path, views) values
      ((now() at time zone 'Asia/Seoul')::date, '/steam', 30),
      ((now() at time zone 'Asia/Seoul')::date - 8, '/steam', 10),
      ((now() at time zone 'Asia/Seoul')::date - 20, '/steam', 999)`); // 14일보다 오래된 열람은 제외
    await pool.query(`insert into app_failures (day, operation, code, count) values ((now() at time zone 'Asia/Seoul')::date - 30, 'api/riot.GET', 'unexpected', 50)`); // 7일 밖
    await pool.query(`insert into riot_errors (status, path) values (403, 'timp'), (404, 'timp')`);
    await pool.query(`insert into ops_alerts (key, title, severity, active) values ('riot.key', 'Riot 키 확인', 'critical', true), ('steam.upstream', '해제됨', 'warning', false)`);
    await pool.query(`insert into ops_jobs (id, job, source, status) values ('timp1', 'chat', 'scheduled', 'failed')`);

    const { improvementReport } = await import('./improvements');
    const report = await improvementReport();
    expect(report.totalViews).toEqual({ current: 30, previous: 10 });
    expect(report.items.map((i) => i.id).slice(0, 3)).toEqual(['fix:lol', 'fix:steam', 'fix:records']);
    expect(report.items[0].reasons).toEqual(['긴급 경고: Riot 키 확인', 'Riot 키 오류(401/403) 1회']);
    expect(report.items[1].reasons).toEqual(['서버 실패 2회 · steam.taste.GET(unexpected) 2회']);
    expect(report.items[2].reasons).toEqual(['채팅 동기화 실패 1회 · 부분 완료 0회']);
    expect(report.items.find((i) => i.id === 'grow:/steam')).toBeDefined();
  });
});
