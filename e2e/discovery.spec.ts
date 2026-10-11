import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, seedDiscovery, statusOf, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('선별된 칭호·인물·비교 기록을 공개하고 반응·공유·다음 행동을 연결한다', async ({ page, context }) => {
  const user = await createUser('discovery', '발견 친구');
  await loginAs(context, user);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  try {
    await seedDiscovery(user);
    await page.setViewportSize({ width: 1504, height: 1045 });
    await page.goto('/');
    const deck = page.getByRole('region', { name: '오늘은 무슨 일이 있었을까?' });
    // 새 fixture의 데이터를 렌더링하는지만 검사한다. 실제 TTL은 cache-expiry.spec.ts에서 검증한다.
    await expect(deck.getByRole('button', { name: '4번째 발견' })).toHaveCount(1);
    await expect(deck.getByText('새벽 2~6시, 가장 많이 말한 사람', { exact: true })).toHaveCount(1);
    const reveal = deck.locator('button[aria-controls]');
    await expect(deck.getByText('발견 친구님 · 12 새벽 메시지')).not.toBeVisible();
    await expect(deck.locator('.discovery-people')).toHaveAttribute('aria-hidden', 'true');
    await expect(deck.getByRole('button', { name: /재밌다/ })).toHaveCount(0);
    await expect(deck.getByRole('button', { name: '친구에게 공유' })).toHaveCount(0);
    await expect(deck.locator('.discovery-dialogue')).toContainText('이번 주 칭호, 누구 거일까.');
    await deck.getByRole('button', { name: '2번째 발견' }).click();
    await expect(deck.getByRole('status').filter({ hasText: '2 /' })).toBeVisible();
    await deck.getByRole('button', { name: '2번째 발견' }).press('ArrowLeft');
    await expect(deck.getByRole('status').filter({ hasText: '1 /' })).toBeVisible();
    await mkdir('output/playwright', { recursive: true });
    for (const width of [1504, 390]) {
      await page.setViewportSize({ width, height: 1045 });
      await expect.poll(() => deck.locator('.discovery-mascot').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.screenshot({ path: `output/playwright/discovery-before-${width}.png` });
    }
    await page.setViewportSize({ width: 1504, height: 1045 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await reveal.focus();
    await page.keyboard.press('Enter');
    await expect(reveal).toBeFocused();
    await expect(reveal).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(deck.getByRole('button', { name: '다음 발견' })).toBeFocused();
    await expect(deck.getByText('발견 친구님 · 12 새벽 메시지')).toBeVisible();
    await expect(deck.getByRole('heading', { name: '새벽 2~6시, 가장 많이 말한 사람' })).toBeVisible();
    await expect(deck.locator('.discovery-prize')).toHaveText('새벽 갤러');
    await expect(deck.locator('.discovery-dialogue')).toContainText('이번 주 이 칭호는 이 사람 거야.');
    await expect(deck.getByRole('button', { name: '다음 발견' })).toHaveText('다음 발견 →');
    expect(await deck.locator('.discovery-people').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(deck.locator('.discovery-avatar img')).toHaveAttribute('src', '/brands/discord.svg');
    expect(await deck.locator('.discovery-avatar img').evaluate(el => getComputedStyle(el).objectFit)).toBe('cover');
    await page.setViewportSize({ width: 390, height: 844 });
    await deck.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
    await page.screenshot({ path: 'output/playwright/discovery-reveal-mobile.png' });
    const nextAction = await deck.getByRole('button', { name: '다음 발견' }).boundingBox();
    const mobileNav = await page.getByRole('navigation', { name: '주요 메뉴' }).boundingBox();
    expect(nextAction!.y + nextAction!.height).toBeLessThanOrEqual(mobileNav!.y);
    await page.setViewportSize({ width: 1504, height: 1045 });
    const reaction = deck.getByRole('button', { name: /재밌다/ });
    await expect(reaction).toBeEnabled();
    await reaction.click();
    await expect(deck.getByRole('button', { name: '재밌어요 1' })).toHaveAttribute('aria-pressed', 'true');
    await deck.getByRole('button', { name: '친구에게 공유' }).click();
    await expect(deck.getByText(/공유할 내용과 링크를 복사했어요/)).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('발견 친구님');
    const sharedUrl = copied.split('\n').at(-1)!;
    expect(sharedUrl).toContain('discovery=award');
    await mkdir('output/playwright', { recursive: true });
    for (const width of [1504, 1024, 390]) {
      await page.setViewportSize({ width, height: 1045 });
      await deck.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
      await page.screenshot({ path: `output/playwright/discovery-content-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1504) {
        const play = await page.locator('.home-play').boundingBox();
        const search = await page.getByRole('search').boundingBox();
        const actions = await page.locator('.home-action-stack').boundingBox();
        const discovery = await deck.boundingBox();
        expect(play!.height).toBeLessThan(250);
        // 게임 도구는 발견 아래 중앙에 있고 오른쪽은 멤버 활동만 표시한다.
        expect(actions!.y).toBeGreaterThanOrEqual(discovery!.y + discovery!.height);
        expect(search!.x).toBeGreaterThan(play!.x + play!.width);
        await expect(page.locator('.home-channel-feed').getByRole('search')).toBeVisible();
        await expect(page.locator('.home-member-panel').getByRole('search')).toHaveCount(0);
        await expect(page.locator('.home-record-award').getByText('발견 친구님 · 12 새벽 메시지')).toBeVisible();
      }
    }
    await deck.getByRole('button', { name: '결과 접기' }).click();
    await expect(reveal).toBeFocused();
    await expect(reveal).toHaveAttribute('aria-expanded', 'false');
    await deck.getByRole('button', { name: '다음 발견' }).click();
    await expect(deck.getByRole('heading', { name: '반응과 답글을 모은 사람은?' })).toBeVisible();
    await deck.getByRole('button', { name: '결과 공개' }).click();
    await expect(deck.getByText('반응 5개에 답글 3개.')).toBeVisible();
    await expect(deck.getByRole('link', { name: '그 한마디 보러 가기' })).toHaveAttribute('href', /e2e_discovery_highlight$/);
    await deck.getByRole('button', { name: '다음 발견' }).click();
    await expect(deck.getByText('평소의 3.3배로 붐빈 10분')).toBeVisible();
    await deck.getByRole('button', { name: '결과 공개' }).click();
    await expect(deck.getByRole('img', { name: '평소 중앙값 12개, 이 순간 40개' })).toBeVisible();
    await deck.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
    await page.screenshot({ path: 'output/playwright/discovery-comparison-mobile.png' });
    await page.locator('.home-record-award').click();
    await expect(deck.getByText('새벽 2~6시, 가장 많이 말한 사람')).toBeVisible();
    await page.goto(sharedUrl);
    await expect(deck.getByText('새벽 2~6시, 가장 많이 말한 사람')).toBeVisible();
    await deck.getByRole('button', { name: '결과 공개' }).click();
    await expect(deck.getByRole('button', { name: '재밌어요 1' })).toHaveAttribute('aria-pressed', 'true');
    await deck.getByRole('button', { name: '재밌어요 1' }).click();
    await expect(deck.getByRole('button', { name: '재밌다 0' })).toHaveAttribute('aria-pressed', 'false');
    for (let i = 0; i < 4; i++) {
      const next = deck.getByRole('button', { name: '다음 발견' });
      if (await next.isDisabled()) break;
      await next.click();
    }
    await expect(deck.getByText(/오늘의 발견 끝/)).toBeVisible();
    await expect(deck.getByRole('button', { name: '다음 발견' })).toBeDisabled();
    await deck.getByRole('button', { name: '게임 뽑기 알아보기' }).click();
    await deck.getByRole('link', { name: '공통 게임 찾고 뽑기' }).click();
    await expect(page).toHaveURL(/\/steam$/);
  } finally {
    await db.query("delete from chat_messages where id like 'e2e_discovery_%'");
    await db.query("delete from chat_highlights where id like 'e2e_discovery_%'");
    await db.query("delete from chat_awards where author_id like 'e2e_discovery_%'");
  }
});

test('모바일 네 탭과 허브가 기존 게임·기록·멤버 화면에 연결된다', async ({ page, context }) => {
  await loginAs(context, await createUser('discovery_nav', '항해 친구'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(nav.getByRole('link')).toHaveCount(4);
  await nav.getByRole('link', { name: '같이 놀기' }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole('main').getByRole('link', { name: /듀오 시너지/ }).click();
  await expect(page).toHaveURL(/\/lol\/synergy$/);
  await expect(nav.getByRole('link', { name: '같이 놀기' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: '우리 기록' }).click();
  await expect(page).toHaveURL(/\/memories$/);
  await page.getByRole('main').getByRole('link', { name: /주간 시상식/ }).click();
  await expect(page).toHaveURL(/\/community\/awards$/);
  await expect(nav.getByRole('link', { name: '우리 기록' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL(/\/people$/);
});

test('반응 API는 로그인·동일 출처·유효한 실제 기록만 허용한다', async ({ page, context }) => {
  await page.goto('/login');
  expect(await statusOf(page, '/api/discovery/reaction?cardId=play%3Asteam')).toBe(401);
  await loginAs(context, await createUser('discovery_validation', '반응 친구'));
  await page.goto('/');
  expect(await statusOf(page, '/api/discovery/reaction?cardId=invalid')).toBe(400);
  expect(await statusOf(page, '/api/discovery/reaction', { method: 'PUT', body: { cardId: 'award:2026-02-31:owl', reacted: true } })).toBe(400);
  expect(await statusOf(page, '/api/discovery/reaction', { method: 'PUT', body: { cardId: 'play:steam', reacted: true, userId: 'someone' } })).toBe(400);
  expect(await statusOf(page, '/api/discovery/reaction', { method: 'PUT', body: { cardId: 'highlight:https://discord.com/channels/100000000000000002/missing/missing', reacted: true } })).toBe(404);
  const foreign = await context.request.put('/api/discovery/reaction', { headers: { origin: 'https://foreign.invalid' }, data: { cardId: 'play:steam', reacted: true } });
  expect(foreign.status()).toBe(403);
});

test('반응 저장 실패와 현재 목록에 없는 공유 기록을 명확히 안내한다', async ({ page, context }) => {
  await loginAs(context, await createUser('discovery_error', '공유 친구'));
  await page.route('**/api/discovery/reaction**', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/?discovery=award%3A2000-01-03%3Aowl');
  const deck = page.getByRole('region', { name: '오늘은 무슨 일이 있었을까?' });
  await expect(deck.getByText(/공유된 발견이 현재 목록에 없어요/)).toBeVisible();
  await deck.locator('button[aria-controls]').click();
  await expect(deck.getByText(/반응을 불러오지 못했어요/)).toBeVisible();
  await deck.getByRole('button', { name: /재밌다/ }).click();
  await expect(deck.getByText(/반응을 저장하지 못했어요/)).toBeVisible();
  await expect(deck.getByRole('button', { name: /재밌다/ })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/?discovery=play%3Asteam');
  await deck.getByRole('button', { name: '게임 뽑기 알아보기' }).click();
  await expect(deck.getByRole('link', { name: '공통 게임 찾고 뽑기' })).toBeVisible();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('blocked'); } }, configurable: true });
  });
  await page.reload();
  await deck.getByRole('button', { name: '게임 뽑기 알아보기' }).click();
  await deck.getByRole('button', { name: '친구에게 공유' }).click();
  await expect(deck.getByLabel('공유할 발견 링크')).toHaveValue(/discovery=play%3Asteam/);
  await expect(deck.getByText('편집자의 제안 · 보유 여부는 멤버 선택 후 확인', { exact: true })).toBeVisible();
  await expect(deck).toHaveCount(1);
  // 스트리밍 전송용 hidden DOM이 남아도 실제로 보이는 발견만 검사한다.
  await deck.evaluate(el => {
    const transport = document.createElement('div');
    transport.hidden = true;
    transport.appendChild(el.cloneNode(true));
    document.body.appendChild(transport);
  });
  // 복제 후에도 같은 선택자와 동작이 유효해야 한다. 숨긴 복제까지 고르면 이 검사가 실패한다.
  await expect(deck).toHaveCount(1);
  await expect(deck.getByLabel('공유할 발견 링크')).toHaveValue(/discovery=play%3Asteam/);
  await deck.getByRole('button', { name: '결과 접기' }).click();
  await expect(deck.locator('button[aria-controls]')).toHaveAttribute('aria-expanded', 'false');
  await deck.locator('button[aria-controls]').click();
  // 접으면 공유 안내가 초기화된다. 다시 공유하여 같은 실패 흐름을 실제 보이는 영역에서 검증한다.
  await deck.getByRole('button', { name: '친구에게 공유' }).click();
  await expect(deck.getByLabel('공유할 발견 링크')).toHaveValue(/discovery=play%3Asteam/);
  await deck.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.screenshot({ path: 'output/playwright/discovery-empty-and-share-failure.png' });
});
