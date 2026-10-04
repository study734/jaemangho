import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

const clean = async () => {
  await db.query(`delete from chat_highlights where id like 'e2e_%'`);
  await db.query(`delete from chat_awards where week_start = '2020-01-06'`);
  await cleanup();
};
test.beforeEach(clean);
test.afterAll(clean);

test('개념글 보관함과 시상식이 보이고, 칭호는 프로필에 모인다', async ({ page, context }) => {
  const me = await createUser('community', 'E2E커뮤');
  await db.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") values ('e2e_acc_c', 'e2e_disc_c', 'discord', $1, now(), now())`, [me.id]);
  await db.query(`insert into chat_highlights (id, channel_id, author_id, author_name, created_at, reactions, replies, top_emoji) values
    ('e2e_h1', 'c1', 'e2e_disc_c', 'E2E커뮤', now() - interval '1 day', 8, 3, '🔥'), ('e2e_h2', 'c1', 'x', '타인', now() - interval '2 days', 0, 5, null)`);
  await db.query(`insert into chat_awards (week_start, title, author_id, author_name, value) values
    ('2020-01-06', 'talker', 'e2e_disc_c', 'E2E커뮤', 321), ('2020-01-06', 'lurker', 'x', '눈팅이', 0)`);
  await loginAs(context, me);

  // 개념글: 최신순, 디스코드 링크
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: '개념글' })).toBeVisible();
  const link = page.getByRole('link', { name: 'E2E커뮤님의 메시지 보러 가기' });
  await expect(page.getByRole('listitem').filter({ has: link })).toContainText('🔥 8 · 💬 3');
  await expect(link).toHaveAttribute('href', /discord\.com\/channels\/.*\/c1\/e2e_h1$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('listitem').filter({ hasText: '타인님의 메시지 보러 가기' })).toContainText('💬 5'); // 반응 없이 답글만 있는 개념글

  // 상단·좌측 메뉴로 시상식 이동
  await page.locator('aside').getByRole('link', { name: '시상식' }).click();
  await expect(page).toHaveURL(/\/community\/awards$/);
  await expect(page.getByText('수다 갤러')).toBeVisible();
  await expect(page.getByText('321 메시지')).toBeVisible();
  await expect(page.getByText('눈팅러')).toBeVisible();

  // 내 프로필에 칭호가 모인다
  await page.goto(`/people/${me.id}`);
  await expect(page.getByRole('heading', { name: '칭호' })).toBeVisible();
  await expect(page.getByText('수다 갤러')).toBeVisible();
});

test('개념글과 시상식이 비어 있으면 안내 문구가 보인다', async ({ page, context }) => {
  await loginAs(context, await createUser('community_empty', 'E2E빈'));
  await page.goto('/community/awards');
  await expect(page.getByText('아직 시상식이 없습니다')).toBeVisible();
});
