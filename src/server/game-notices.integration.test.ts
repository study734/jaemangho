import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('게임 일정·코드 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let notices: typeof import('./game-notices');
  const cleanup = async () => { await pool.query(`delete from "user" where id like 'tn_%'`); };
  const addUser = (id: string) => pool.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $1, $2, false, now(), now())`, [id, `${id}@test.invalid`]);

  beforeAll(async () => {
    pool = await openTestDb();
    notices = await import('./game-notices');
    await cleanup();
    await addUser('tn_a'); await addUser('tn_b');
  });
  afterAll(async () => { await cleanup(); await pool.end(); });

  it('만료된 글은 목록에서 빠지고, 기한 없는 코드는 남는다', async () => {
    const hour = 3_600_000;
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    await notices.addNotice('tn_a', { kind: 'event', game: 'G', title: 'past', startsAt: at(-48 * hour) });
    await notices.addNotice('tn_a', { kind: 'event', game: 'G', title: 'running', startsAt: at(-hour), endsAt: at(hour) });
    await notices.addNotice('tn_a', { kind: 'code', game: 'G', title: 'expired', code: 'OLD', endsAt: at(-hour) });
    await notices.addNotice('tn_a', { kind: 'code', game: 'G', title: 'forever', code: 'NEW' });
    const titles = (await notices.listNotices()).filter(n => n.userId === 'tn_a').map(n => n.title);
    expect(titles.sort()).toEqual(['forever', 'running']);
  });

  it('작성자나 관리자만 지울 수 있다', async () => {
    const id = await notices.addNotice('tn_a', { kind: 'code', game: 'G', title: 'mine', code: 'X' });
    expect(await notices.deleteNotice(id, 'tn_b', false)).toBe(false);
    expect(await notices.deleteNotice(id, 'tn_b', true)).toBe(true);
    expect(await notices.deleteNotice(id, 'tn_a', false)).toBe(false);
  });
});
