import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('상세 전적 실패를 빈 전적과 구분하고 다시 열면 복구한다', async ({ page, context }) => {
  await loginAs(context, await createUser('diagnostic_details', '진단 친구'));
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_diagnostic', 'E2E진단', 'KR1')`);
  await mockRiot(page, { gameName: 'E2E진단', tagLine: 'KR1' });
  let failed = true;
  await page.route(/\/api\/riot\?/, route => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? '';
    return path.endsWith('/ids') ? route.fulfill({ status: failed ? 503 : 200, json: failed ? {} : [] }) : route.fallback();
  });
  await page.goto('/lol');
  const open = page.getByRole('button', { name: 'E2E진단#KR1 상세 보기' });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('최근 전적 조회에 실패');
  await expect(dialog.getByText('매치 내역이 없습니다.')).toHaveCount(0);
  await mkdir('output/playwright', { recursive: true });
  for (const width of [1504, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/diagnostics-${width}.png` });
  }
  await dialog.getByRole('button', { name: '상세 닫기' }).click();
  failed = false;
  await open.click();
  await expect(dialog.getByText('매치 내역이 없습니다.')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('저장 실패의 상태와 오류 ID를 안내하고 낙관적으로 추가한 항목을 복구한다', async ({ page, context }) => {
  await loginAs(context, await createUser('diagnostic_save', '저장 친구'));
  await mockRiot(page);
  const requestId = '12345678-1234-1234-1234-123456789abc';
  await page.route('**/api/members', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, headers: { 'X-Request-ID': requestId }, json: { error: 'Server error', requestId } })
    : route.fallback());
  await page.goto('/lol/squad');
  await page.getByRole('button', { name: '소환사 추가' }).click();
  await page.getByPlaceholder('예: Faker').fill('E2E소환사');
  await page.getByPlaceholder('예: KR1').fill('KR1');
  await page.getByRole('button', { name: /소환사 검색 및 검증/ }).click();
  await page.getByRole('button', { name: /이 소환사 추가하기/ }).click();
  const notice = page.getByRole('alert').filter({ has: page.getByRole('button', { name: '오류 안내 닫기' }) });
  await expect(notice).toContainText('HTTP 500');
  await expect(notice).toContainText(requestId);
  await expect(page.getByRole('heading', { name: 'E2E소환사', exact: true })).toHaveCount(0);
});

test('저장과 목록 재조회가 모두 실패하면 두 실패 사유를 유지한다', async ({ page, context }) => {
  await loginAs(context, await createUser('diagnostic_reload', '재조회 친구'));
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_diagnostic', 'E2E진단', 'KR1')`);
  await mockRiot(page, { gameName: 'E2E진단', tagLine: 'KR1' });
  page.on('dialog', dialog => dialog.accept());
  let failReload = false;
  await page.route('**/api/members**', route => {
    if (route.request().method() === 'DELETE') {
      failReload = true;
      return route.fulfill({ status: 401, json: {} });
    }
    return failReload ? route.fulfill({ status: 503, json: {} }) : route.fallback();
  });
  await page.goto('/lol/squad');
  await page.getByTitle('목록에서 삭제').first().click();
  const notice = page.getByRole('alert').filter({ has: page.getByRole('button', { name: '오류 안내 닫기' }) });
  await expect(notice).toContainText('로그인이 만료');
  await expect(notice).toContainText('HTTP 503');
});

test('이전 소환사의 늦은 실패가 새로 연 상세 화면을 덮어쓰지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('diagnostic_order', '순서 친구'));
  await db.query(`insert into members (id, game_name, tag_line) values
    ('e2e_diagnostic_a', 'E2E진단A', 'KR1'), ('e2e_diagnostic_b', 'E2E진단B', 'KR1')`);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await mockRiot(page);
  await page.route(/\/api\/riot\?/, async route => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? '';
    if (path.startsWith('/riot/account/')) {
      const first = decodeURIComponent(path).includes('E2E진단A');
      return route.fulfill({ json: { puuid: first ? 'PUUID_A' : 'PUUID_B', gameName: first ? 'E2E진단A' : 'E2E진단B', tagLine: 'KR1' } });
    }
    if (path.endsWith('/ids')) {
      if (path.includes('PUUID_A')) {
        requested = true;
        await delayed;
        return route.fulfill({ status: 503, json: {} });
      }
      return route.fulfill({ json: [] });
    }
    return route.fallback();
  });
  try {
    await page.goto('/lol');
    await page.getByRole('button', { name: 'E2E진단A#KR1 상세 보기' }).click();
    await expect.poll(() => requested).toBe(true);
    await page.getByRole('button', { name: '상세 닫기' }).click();
    await page.getByRole('button', { name: 'E2E진단B#KR1 상세 보기' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('매치 내역이 없습니다.')).toBeVisible();
    const response = page.waitForResponse(response => {
      const path = new URL(response.url()).searchParams.get('path') ?? '';
      return path.includes('PUUID_A') && path.endsWith('/ids');
    });
    release();
    await response;
    await expect(dialog.getByRole('heading')).toContainText('E2E진단B');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  } finally { release(); }
});
