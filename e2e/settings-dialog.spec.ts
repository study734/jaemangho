import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('하단 설정은 채널을 유지하고 모달에서 연결을 확인하며 닫힌 뒤 포커스를 돌려준다', async ({ page, context }) => {
  await loginAs(context, await createUser('settings_dialog', '설정 친구'));
  await mockRiot(page);
  await page.goto('/play');
  await expect(page.locator('.channel-scroll a[href="/lol/settings"]')).toHaveCount(0);
  const trigger = page.locator('.channel-user').getByRole('button', { name: '설정', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '사용자 설정' });
  await expect(dialog.getByRole('heading', { name: '계정 정보' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: '관리자 화면' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/play$/);
  await expect(dialog.getByRole('button', { name: '설정 닫기' })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Riot 연결', exact: true }).click();
  await dialog.getByRole('button', { name: '연결 테스트', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('라이엇 API 연결 테스트 성공!');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('PC·태블릿·모바일에서 긴 이름과 설정 내용을 넘침 없이 표시한다', async ({ page, context }) => {
  await loginAs(context, await createUser('settings_responsive', '아주긴이름을가진재망호친구와함께설정을확인합니다'));
  await page.goto('/play');
  await mkdir('output/playwright', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1504, 1024, 965, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: '설정', exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole('dialog', { name: '사용자 설정' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/settings-${width}.png` });
    await dialog.getByRole('button', { name: 'Riot 연결', exact: true }).click();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('관리자 링크는 기존 관리자에게 표시되고 같은 화면으로 이어진다', async ({ page, context }) => {
  await loginAs(context, await createUser('settings_admin', '설정 관리자', 'admin'));
  await page.goto('/');
  await page.locator('.channel-user').getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: '관리자 화면' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
