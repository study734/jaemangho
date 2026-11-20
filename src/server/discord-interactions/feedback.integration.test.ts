import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

// intent/0002-member-feedback-channel R3·R4·R5·R6·R7
describe.skipIf(!testDbUrl)('멤버 의견 저장 (격리 DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let store: typeof import('./feedback');
  const discordId = '100000000000000071';
  const id = (n: number) => `40000000000000${String(n).padStart(4, '0')}`;
  beforeAll(async () => {
    pool = await openTestDb(); store = await import('./feedback');
    await pool.query(`insert into "user" (id, name, email, "emailVerified") values ('fb_user', '의견테스트', 'fb@test.invalid', false) on conflict do nothing`);
  });
  beforeEach(async () => { await pool.query('delete from member_feedback'); });
  afterAll(async () => {
    await pool.query('delete from member_feedback'); await pool.query(`delete from "user" where id = 'fb_user'`); await pool.end();
  });
  const save = (n: number, body = `의견 ${n}`, link: string | null = null) =>
    store.saveFeedback({ id: id(n), userId: 'fb_user', discordId, body, source: link ? 'message' : 'command', messageLink: link });

  it('같은 제출이 다시 와도 한 번만 저장한다', async () => {
    expect(await save(1)).toBe('saved');
    expect(await save(1)).toBe('saved');
    expect((await pool.query('select count(*)::int as n from member_feedback')).rows[0].n).toBe(1);
  });
  it('24시간 안에 5건을 넘으면 거부하고, 지나면 다시 받는다', async () => {
    for (let n = 1; n <= 5; n++) expect(await save(n)).toBe('saved');
    expect(await save(6)).toBe('limited');
    expect((await pool.query('select count(*)::int as n from member_feedback')).rows[0].n).toBe(5);
    await pool.query(`update member_feedback set created_at = now() - interval '25 hours'`);
    expect(await save(7)).toBe('saved');
  });
  it('최근 7일 의견 수와 최신 5건을 표시 이름·메시지 링크와 함께 돌려준다', async () => {
    const link = 'https://discord.com/channels/100000000000000002/100000000000000080/100000000000000081';
    for (let n = 1; n <= 5; n++) await save(n);
    await pool.query(`update member_feedback set created_at = now() - interval '2 days'`);
    await save(6, '가장 최근', link);
    await pool.query(`insert into member_feedback (id, user_id, discord_id, body, source, created_at)
      values ($1, 'fb_user', $2, '오래된 의견', 'command', now() - interval '8 days')`, [id(9), discordId]);
    const recent = await store.recentFeedback();
    expect(recent.count).toBe(6);
    expect(recent.items).toHaveLength(5);
    expect(recent.items[0]).toMatchObject({ name: '의견테스트', body: '가장 최근', messageLink: link });
    expect(recent.items.map(item => item.body)).not.toContain('오래된 의견');
  });
  it('90일이 지난 의견을 지운다', async () => {
    await save(1); await save(2);
    await pool.query(`update member_feedback set created_at = now() - interval '91 days' where id = $1`, [id(1)]);
    await store.purgeOldFeedback();
    expect((await pool.query('select id from member_feedback')).rows).toEqual([{ id: id(2) }]);
  });
});
