import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

const A = '76561193000000001';
const B = '76561193000000002';
const C = '76561193000000003';

describe.skipIf(!testDbUrl)('디스코드 연결 -> Steam 멤버 자동 연결 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let link: typeof import('./discord-connections');

  const cleanup = async () => {
    await pool.query(`delete from steam_members where steam_id like '7656119300000000_'`);
    await pool.query(`delete from "user" where id like 'tc_%'`);
  };
  const addUser = (id: string, name: string) =>
    pool.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, false, now(), now())`, [id, name, `${id}@test.invalid`]);
  const owner = async (steamId: string) => (await pool.query(`select owner_id, persona_name, avatar, created_by_name from steam_members where steam_id = $1`, [steamId])).rows[0];

  beforeAll(async () => {
    pool = await openTestDb();
    link = await import('./discord-connections');
    await cleanup();
    await addUser('tc_a', '자동철수');
    await addUser('tc_b', '자동영희');
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('등록되지 않은 계정은 새로 등록하고 주인으로 지정한다 (이름은 Steam에서)', async () => {
    await link.linkSteamAccounts('tc_a', [{ id: A, name: '연결이름' }], async () => ({ name: 'Steam이름', avatar: 'http://a/x.jpg' }));
    expect(await owner(A)).toEqual({ owner_id: 'tc_a', persona_name: 'Steam이름', avatar: 'http://a/x.jpg', created_by_name: '자동철수' });
  });

  it('Steam 조회가 안 되면 연결에 적힌 이름으로 등록한다', async () => {
    await link.linkSteamAccounts('tc_a', [{ id: B, name: '연결이름B' }], async () => null);
    expect(await owner(B)).toMatchObject({ owner_id: 'tc_a', persona_name: '연결이름B', avatar: null });
  });

  it('주인이 비어 있는 기존 계정은 주인만 채우고, 이미 주인이 있는 계정은 가로채지 않는다', async () => {
    await pool.query(`insert into steam_members (steam_id, persona_name) values ($1, '주인없음')`, [C]);
    await link.linkSteamAccounts('tc_b', [{ id: C, name: 'x' }], async () => null);
    expect(await owner(C)).toMatchObject({ owner_id: 'tc_b', persona_name: '주인없음' }); // 이름은 그대로

    await link.linkSteamAccounts('tc_a', [{ id: C, name: 'x' }], async () => null); // 이미 tc_b의 것
    expect((await owner(C)).owner_id).toBe('tc_b');
  });

  it('같은 연결로 다시 로그인해도 그대로이고, 연결이 없으면 아무 일도 없다', async () => {
    await link.linkSteamAccounts('tc_a', [{ id: A, name: '연결이름' }], async () => ({ name: '바뀐이름', avatar: null }));
    expect(await owner(A)).toMatchObject({ owner_id: 'tc_a', persona_name: 'Steam이름' });
    await expect(link.linkSteamAccounts('tc_a', [])).resolves.toBeUndefined();
  });
});
