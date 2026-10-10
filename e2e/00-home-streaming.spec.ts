import { mkdir, rm } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('집계가 느려도 게임 찾기는 먼저 보이고 뜨거운 순간은 한 번만 조회한다', async ({ page, context }) => {
  // 반복 실행에서도 이전 빌드의 디스크 데이터 캐시가 지연 검증을 우회하지 않게 한다.
  // 단일 worker의 첫 테스트이며 서버는 아직 홈을 요청하지 않았다.
  await rm('.next/cache/fetch-cache', { recursive: true, force: true });
  await loginAs(context, await createUser('streaming', '느린 집계 친구'));
  const lock = await db.connect();
  try {
    await lock.query('begin');
    // 캐시가 비어 있는 서버의 첫 홈 요청에서 집계 조회만 지연시킨다.
    await lock.query('lock table chat_messages in access exclusive mode');
    await page.setViewportSize({ width: 1504, height: 1045 });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByRole('link', { name: '같이 할 게임 찾기', exact: true })).toBeVisible();
    await expect(page.getByText('확인된 기록에서 오늘의 발견을 찾고 있어요.')).toBeVisible();
    // 한 요청의 발견·커뮤니티 구역이 같은 대화 구간 쿼리를 공유해야 한다.
    await expect.poll(async () => {
      const result = await db.query(`select count(*)::int as n from pg_stat_activity
        where datname = current_database() and state = 'active' and wait_event_type = 'Lock'
        and query like 'with b as (%'`);
      return result.rows[0].n;
    }).toBe(1);
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/discovery-loading-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/playwright/discovery-loading-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await lock.query('rollback');
    lock.release();
  }
  await expect(page.getByText('확인된 기록에서 오늘의 발견을 찾고 있어요.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '게임 뽑기 알아보기' })).toBeVisible();
});

test('최근 활동 조회 실패는 게임 찾기와 발견을 막거나 빈 기록으로 위장하지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('feed_failure', '기록 조회 친구'));
  // 테스트 전용 DB의 한 테이블을 잠시 가려 특정 부가 조회만 실패시킨다.
  await db.query('alter table steam_members rename to e2e_unavailable_steam_members');
  try {
    await page.goto('/');
    // 스트리밍 중 숨겨진 임시 HTML에도 같은 문구가 있을 수 있다. 실제 멤버 패널의 접근 가능한 안내를 확인한다.
    const notice = page.getByRole('complementary', { name: '멤버 활동과 최근 접속' }).getByRole('status').filter({ hasText: '최근 활동과 접속 기록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.' });
    await expect(notice).toBeVisible();
    await expect(page.getByRole('button', { name: '게임 뽑기 알아보기' })).toBeVisible();
    await expect(page.getByRole('link', { name: '같이 할 게임 찾기', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '요즘 우리' })).toHaveCount(0);
    await mkdir('output/playwright', { recursive: true });
    await notice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/home-feed-failure.png' });
  } finally {
    await db.query('alter table e2e_unavailable_steam_members rename to steam_members');
  }
});
