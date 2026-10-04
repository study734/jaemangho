import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from './testing/db';

describe.skipIf(!testDbUrl)('멤버 연결 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let people: typeof import('./people');
  let lol: typeof import('./lol/roster');
  let steam: typeof import('./steam/roster');

  const cleanup = async () => {
    await pool.query(`delete from members where id like 'tp_%'`);
    await pool.query(`delete from steam_members where steam_id like '7656119200000000_'`);
    await pool.query(`delete from "user" where id like 'tp_%'`);
  };
  const addUser = (id: string, name: string, banned = false) =>
    pool.query(`insert into "user" (id, name, email, "emailVerified", banned, "createdAt", "updatedAt") values ($1, $2, $3, false, $4, now(), now())`, [id, name, `${id}@test.invalid`, banned]);

  beforeAll(async () => {
    pool = await openTestDb();
    people = await import('./people');
    lol = await import('./lol/roster');
    steam = await import('./steam/roster');
    await cleanup();
    await addUser('tp_a', '연결철수');
    await addUser('tp_b', '연결영희');
    await addUser('tp_x', '연결차단', true);
  });
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('롤 계정은 등록자가 기본 주인이고, 다른 사람이나 주인 없음으로 지정할 수 있다', async () => {
    const a = { id: 'tp_1', gameName: 'A', tagLine: 'KR1' };
    await lol.addToRoster(a, { id: 'tp_a', name: '연결철수' });
    await lol.addToRoster({ id: 'tp_2', gameName: 'B', tagLine: 'KR1', ownerId: 'tp_b' }, { id: 'tp_a', name: '연결철수' });
    await lol.addToRoster({ id: 'tp_3', gameName: 'C', tagLine: 'KR1', ownerId: null }, { id: 'tp_a', name: '연결철수' });
    const owners = Object.fromEntries((await lol.listRoster()).filter((e) => e.id.startsWith('tp_')).map((e) => [e.id, e.ownerId]));
    expect(owners).toEqual({ tp_1: 'tp_a', tp_2: 'tp_b', tp_3: null });

    // 수정: ownerId를 안 보내면 주인은 그대로, 보내면 바뀐다
    await lol.updateRoster({ id: 'tp_1', gameName: 'A2', tagLine: 'KR1' });
    expect((await pool.query(`select owner_id from members where id = 'tp_1'`)).rows[0].owner_id).toBe('tp_a');
    await lol.updateRoster({ id: 'tp_1', gameName: 'A2', tagLine: 'KR1', ownerId: 'tp_b' });
    expect((await pool.query(`select owner_id from members where id = 'tp_1'`)).rows[0].owner_id).toBe('tp_b');
  });

  it('존재하지 않는 사용자 id(개발용 로그인 등)는 주인 없음으로 저장된다', async () => {
    await lol.addToRoster({ id: 'tp_4', gameName: 'D', tagLine: 'KR1' }, { id: 'dev', name: '개발자' });
    expect((await pool.query(`select owner_id from members where id = 'tp_4'`)).rows[0].owner_id).toBeNull();
  });

  it('Steam 주인도 지정·해제할 수 있고, 없는 계정은 false', async () => {
    await pool.query(`insert into steam_members (steam_id, persona_name) values ('76561192000000001', '스팀A')`);
    expect(await steam.setSteamOwner('76561192000000001', 'tp_a')).toBe(true);
    expect((await steam.listSteamMembers()).find((m) => m.steamId === '76561192000000001')?.ownerId).toBe('tp_a');
    expect(await steam.setSteamOwner('76561192000000001', null)).toBe(true);
    expect(await steam.setSteamOwner('76561192000000009', 'tp_a')).toBe(false);
    await steam.setSteamOwner('76561192000000001', 'tp_b');
  });

  it('멤버 목록과 프로필에 연결된 계정이 모이고, 차단된 사용자는 나오지 않는다', async () => {
    const list = await people.listPeople();
    expect(list.find((p) => p.id === 'tp_b')).toMatchObject({ name: '연결영희', lolCount: 2, steamCount: 1 });
    expect(list.some((p) => p.id === 'tp_x')).toBe(false);

    const person = await people.getPerson('tp_b');
    expect(person?.lol.map((a) => a.gameName).sort()).toEqual(['A2', 'B']);
    expect(person?.steam.map((a) => a.name)).toEqual(['스팀A']);
    expect(await people.getPerson('tp_x')).toBeNull();
    expect(await people.getPerson('tp_nope')).toBeNull();
  });

  it('사용자가 지워져도 계정은 남고 주인만 비워진다', async () => {
    await pool.query(`delete from "user" where id = 'tp_b'`);
    expect((await pool.query(`select owner_id from members where id = 'tp_2'`)).rows[0].owner_id).toBeNull();
  });
});
