import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, statusOf, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('선별된 칭호·인물·비교 기록을 공개하고 반응·공유·다음 행동을 연결한다', async ({ page, context }) => {
  test.setTimeout(240_000);
  const user = await createUser('discovery', '발견 친구');
  await loginAs(context, user);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  try {
    await db.query(`update "user" set image = '/brands/discord.svg' where id = $1`, [user.id]);
    await db.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values ('e2e_discovery_account', 'e2e_discovery_author_0', 'discord', $1, now(), now())`, [user.id]);
    await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
      select 'e2e_discovery_current_' || lpad(n::text, 2, '0'), 'e2e_discovery_channel', 'e2e_discovery_author_' || n % 4,
      case when n % 4 = 0 then '발견 친구' else '항해 친구 ' || n % 4 end,
      date_trunc('hour', now()) - interval '1 hour' + n * interval '1 second', 0 from generate_series(0, 39) n`);
    await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
      select 'e2e_discovery_baseline_' || b || '_' || n, 'e2e_discovery_channel', 'e2e_discovery_author_' || n % 4, '항해 친구',
      date_trunc('hour', now()) - interval '1 hour' - b * interval '1 day' + n * interval '1 second', 0
      from generate_series(1, 6) b cross join generate_series(0, 11) n`);
    await db.query(`insert into chat_highlights (id, channel_id, author_id, author_name, created_at, reactions, replies)
      values ('e2e_discovery_highlight', 'e2e_discovery_channel', 'e2e_discovery_author_0', '발견 친구', now() - interval '2 hours', 5, 3)`);
    await db.query(`insert into chat_awards (week_start, title, author_id, author_name, value)
      values ((date_trunc('week', now() at time zone 'Asia/Seoul') - interval '7 days')::date, 'owl', 'e2e_discovery_author_0', '발견 친구', 12)`);
    await page.setViewportSize({ width: 1504, height: 1045 });
    await page.goto('/');
    const deck = page.getByRole('region', { name: '오늘은 무슨 일이 있었을까?' });
    // 홈의 출처들은 각각 60초 캐시라 카드가 한꺼번에 나타나지 않는다. 네 장이 모두 모일 때까지 기다린다.
    await expect.poll(async () => {
      await page.reload();
      return deck.getByRole('button', { name: '4번째 발견' }).count();
    }, { timeout: 150_000, intervals: [1000, 5000] }).toBe(1);
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
        expect(play!.height).toBeLessThan(250);
        expect(search!.y).toBeLessThan(700);
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
  const deck = page.locator('.discovery-deck');
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
  await deck.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.screenshot({ path: 'output/playwright/discovery-empty-and-share-failure.png' });
});
