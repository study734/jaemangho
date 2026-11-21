import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('Discord command account mapping (isolated DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let access: typeof import('./access');
  const discordIds = ['100000000000000003', '100000000000000004'];
  const steamIds = ['76561199000003195', '76561199000003196'];
  const cleanup = async () => {
    await pool.query('delete from steam_members where steam_id = any($1)', [steamIds]);
    await pool.query('delete from "user" where id like $1', ['dci_test_%']);
  };
  beforeAll(async () => {
    pool = await openTestDb(); access = await import('./access');
    await cleanup();
    for (let i = 0; i < 2; i++) {
      const id = `dci_test_${i}`;
      await pool.query(`insert into "user" (id, name, email, "emailVerified", banned) values ($1, $2, $3, false, false)`, [id, `Friend ${i}`, `${id}@test.invalid`]);
      await pool.query(`insert into account (id, "accountId", "providerId", "userId", "updatedAt") values ($1, $2, 'discord', $3, now())`, [id, discordIds[i], id]);
      await pool.query(`insert into steam_members (steam_id, persona_name, owner_id) values ($1, $2, $3)`, [steamIds[i], `Steam ${i}`, id]);
    }
  });
  afterAll(async () => { await cleanup(); await pool.end(); });
  it('maps Discord provider identities to project users and Steam owners', async () => {
    expect(await access.commandUser(discordIds[0])).toBe('dci_test_0');
    expect(await access.commandUser('100000000000000099')).toBeNull();
    expect(await access.linkedPlayers(discordIds)).toEqual(discordIds.map((discordId, i) => ({ discordId, steamId: steamIds[i] })));
  });
  it('commandAccess: 계정 있음은 id, 계정 없음은 손님, 차단은 banned, 다른 provider는 손님 (intent/0004 R1·R3)', async () => {
    const m = (id: string) => ({ user: { id } });
    expect(await access.commandAccess(m(discordIds[0]))).toEqual({ kind: 'ok', userId: 'dci_test_0' });
    expect(await access.commandAccess(m('100000000000000099'))).toEqual({ kind: 'ok', userId: null });
    await pool.query('update "user" set banned = true where id = $1', ['dci_test_1']);
    expect(await access.commandAccess(m(discordIds[1]))).toEqual({ kind: 'banned' });
    await pool.query('update "user" set banned = null where id = $1', ['dci_test_1']);
    expect(await access.commandAccess(m(discordIds[1]))).toEqual({ kind: 'ok', userId: 'dci_test_1' });
    await pool.query('update "user" set banned = false where id = $1', ['dci_test_1']);
    await pool.query('update account set "providerId" = $1 where id = $2', ['steam', 'dci_test_1']);
    expect(await access.commandAccess(m(discordIds[1]))).toEqual({ kind: 'ok', userId: null });
    await pool.query('update account set "providerId" = $1 where id = $2', ['discord', 'dci_test_1']);
  });
  it('commandAccess: 사용 역할을 정하면 서명된 역할이나 Administrator 권한이 있어야 한다 (intent/0004 R8)', async () => {
    const role = '100000000000000500';
    await pool.query(`insert into discord_member_role (id, role_id, set_by) values (1, $1, 'test') on conflict (id) do update set role_id = excluded.role_id`, [role]);
    try {
      expect(await access.commandAccess({ user: { id: discordIds[0] } })).toEqual({ kind: 'no_role', roleId: role });
      expect(await access.commandAccess({ user: { id: '100000000000000099' }, roles: ['100000000000000501'] })).toEqual({ kind: 'no_role', roleId: role });
      expect(await access.commandAccess({ user: { id: discordIds[0] }, roles: [role] })).toEqual({ kind: 'ok', userId: 'dci_test_0' });
      expect(await access.commandAccess({ user: { id: '100000000000000099' }, permissions: '8' })).toEqual({ kind: 'ok', userId: null });
      await pool.query('update "user" set banned = true where id = $1', ['dci_test_0']);
      expect(await access.commandAccess({ user: { id: discordIds[0] }, roles: [role] })).toEqual({ kind: 'banned' });
      await pool.query('update "user" set banned = false where id = $1', ['dci_test_0']);
    } finally { await pool.query('delete from discord_member_role'); }
  });
  it('accepts admin commands only with both the site admin role and the signed Administrator bit', async () => {
    expect(await access.adminUser(discordIds[0], '8')).toBeNull();
    await pool.query('update "user" set role = $1 where id = $2', ['admin', 'dci_test_0']);
    expect(await access.adminUser(discordIds[0], '8')).toEqual({ id: 'dci_test_0', name: 'Friend 0' });
    expect(await access.adminUser(discordIds[0], '0')).toBeNull();
    expect(await access.adminUser(discordIds[0], undefined)).toBeNull();
    await pool.query('update "user" set banned = true where id = $1', ['dci_test_0']);
    expect(await access.adminUser(discordIds[0], '8')).toBeNull();
    await pool.query('update "user" set banned = false, role = $1 where id = $2', ['user', 'dci_test_0']);
  });
  it('honors new bans immediately on commands and selections', async () => {
    await pool.query('update "user" set banned = true where id = $1', ['dci_test_1']);
    expect(await access.commandUser(discordIds[1])).toBeNull();
    expect(await access.linkedPlayers(discordIds)).toEqual([{ discordId: discordIds[0], steamId: steamIds[0] }]);
    await pool.query('update "user" set banned = false where id = $1', ['dci_test_1']);
  });
  it('ignores other providers and ownerless Steam accounts; returns multiple linked accounts without guessing', async () => {
    await pool.query('update account set "providerId" = $1 where id = $2', ['steam', 'dci_test_1']);
    expect(await access.commandUser(discordIds[1])).toBeNull();
    expect(await access.linkedPlayers([discordIds[1]])).toEqual([]);
    await pool.query('update account set "providerId" = $1 where id = $2', ['discord', 'dci_test_1']);
    await pool.query('update steam_members set owner_id = null where steam_id = $1', [steamIds[1]]);
    expect(await access.linkedPlayers([discordIds[1]])).toEqual([]);
    await pool.query('update steam_members set owner_id = $1 where steam_id = $2', ['dci_test_0', steamIds[1]]);
    expect(await access.linkedPlayers([discordIds[0]])).toHaveLength(2);
  });
});
