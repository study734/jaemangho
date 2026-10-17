import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, statusOf, test } from './fixtures';

test.beforeEach(async () => { await cleanup(); });
test.afterAll(async () => { await cleanup(); });

test('중단된 대화·설정 API는 인증을 유지하고 410을 반환한다', async ({ page, context }) => {
  await page.goto('/login');
  for (const [path, method] of [['/api/ai', 'POST'], ['/api/ai/settings', 'GET'], ['/api/ai/settings', 'PUT']]) {
    expect(await statusOf(page, path, { method })).toBe(401);
  }
  const user = await createUser('ai_suspended', 'E2E 중단 안내');
  await loginAs(context, user);
  for (const [path, method] of [['/api/ai', 'POST'], ['/api/ai/settings', 'GET'], ['/api/ai/settings', 'PUT']]) {
    expect(await statusOf(page, path, { method, ...(method === 'GET' ? {} : { body: { question: '전송되지 않아야 함' } }) })).toBe(410);
  }
  await db.query('update "user" set banned = true where id = $1', [user.id]);
  expect(await statusOf(page, '/api/ai', { method: 'POST' })).toBe(403);
});

test('PC·전환점·모바일에는 전송 기능 없이 중단 안내와 기존 기능만 보인다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_notice', 'E2E 중단 안내'));
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/ai') || request.url().includes('nvidia.com')) requests.push(request.url());
  });
  await mkdir('output/playwright', { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/chat');
    const notice = page.locator('.chat-suspended');
    await expect(notice.getByRole('heading', { name: '재순이와 대화' })).toBeVisible();
    await expect(notice.getByRole('status')).toContainText('AI 대화 기능은 중단했어요');
    await expect(notice.getByRole('link', { name: 'Steam 게임 찾기' })).toBeVisible();
    await expect(notice.getByRole('link', { name: '롤 전적 보기' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /전송|취향 저장|자료 붙여서/ })).toHaveCount(0);
    expect(await notice.innerText()).not.toMatch(/API 키|NVIDIA 전송/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: `output/playwright/chat-suspended-${width}.png` });
  }
  expect(requests).toEqual([]);
  await page.getByRole('link', { name: 'Steam 게임 찾기', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/steam$/);
});

test('그림 실패 후에도 중단 이유와 이동 링크를 사용할 수 있다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_image_failure', 'E2E 그림 실패'));
  await page.route('**/images/jaesuni-resting.webp', route => route.abort());
  await page.goto('/chat');
  await expect(page.getByRole('status')).toContainText('AI 대화 기능은 중단했어요');
  await expect(page.getByRole('img', { name: /팻말/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '롤 전적 보기' })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/chat-suspended-image-failure.png' });
});

test('게임·기록 화면에서 취소한 자료 첨부나 AI 요청을 시작하지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_no_handoff', 'E2E 외부 전송 없음'));
  await mockRiot(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/ai')) requests.push(request.url()); });
  for (const path of ['/', '/steam', '/lol', '/community', '/community/awards']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: /자료 붙여서 대화하기|대화방 열기/ })).toHaveCount(0);
  }
  expect(requests).toEqual([]);
});
