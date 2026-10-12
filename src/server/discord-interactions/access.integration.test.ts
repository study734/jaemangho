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
    expect(await access.canUseCommand(discordIds[0])).toBe(true);
    expect(await access.canUseCommand('100000000000000099')).toBe(false);
    expect(await access.linkedPlayers(discordIds)).toEqual(discordIds.map((discordId, i) => ({ discordId, steamId: steamIds[i] })));
  });
  it('honors new bans immediately on commands and selections', async () => {
    await pool.query('update "user" set banned = true where id = $1', ['dci_test_1']);
    expect(await access.canUseCommand(discordIds[1])).toBe(false);
    expect(await access.linkedPlayers(discordIds)).toEqual([{ discordId: discordIds[0], steamId: steamIds[0] }]);
    await pool.query('update "user" set banned = false where id = $1', ['dci_test_1']);
  });
  it('ignores other providers and ownerless Steam accounts; returns multiple linked accounts without guessing', async () => {
    await pool.query('update account set "providerId" = $1 where id = $2', ['steam', 'dci_test_1']);
    expect(await access.canUseCommand(discordIds[1])).toBe(false);
    expect(await access.linkedPlayers([discordIds[1]])).toEqual([]);
    await pool.query('update account set "providerId" = $1 where id = $2', ['discord', 'dci_test_1']);
    await pool.query('update steam_members set owner_id = null where steam_id = $1', [steamIds[1]]);
    expect(await access.linkedPlayers([discordIds[1]])).toEqual([]);
    await pool.query('update steam_members set owner_id = $1 where steam_id = $2', ['dci_test_0', steamIds[1]]);
    expect(await access.linkedPlayers([discordIds[0]])).toHaveLength(2);
  });
});
