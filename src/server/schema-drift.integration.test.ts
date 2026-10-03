import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/migrate.mjs';
import { createScratchDb, testDbUrl } from './testing/db';

// migrations/ 로 만든 스키마가 로그인 라이브러리(Better Auth)가 기대하는 스키마와 같은지 확인한다.
// 라이브러리 업그레이드나 user 추가 필드 변경 때 마이그레이션을 빼먹으면 여기서 실패한다.
describe.skipIf(!testDbUrl)('스키마 일치 (마이그레이션 vs Better Auth)', () => {
  let drop: (() => Promise<void>) | undefined;
  afterAll(async () => {
    await drop?.();
  });

  it('migrations/ 적용 후 라이브러리가 만들거나 추가할 테이블·컬럼이 없다', async () => {
    const scratch = await createScratchDb();
    drop = scratch.drop;
    await migrate({ url: scratch.url });

    Object.assign(process.env, {
      DATABASE_URL: scratch.url,
      SESSION_SECRET: 'integration-test-secret-at-least-32-chars',
      DISCORD_CLIENT_ID: 'cid',
      DISCORD_CLIENT_SECRET: 'csecret',
      DISCORD_GUILD_ID: 'G',
    });
    const [{ auth }, { pool }, { getMigrations }] = await Promise.all([
      import('./auth'),
      import('./pool'),
      import('better-auth/db/migration'),
    ]);
    try {
      const { toBeCreated, toBeAdded } = await getMigrations(auth.options);
      expect(toBeCreated.map((t) => t.table)).toEqual([]);
      expect(toBeAdded.map((t) => `${t.table}:${Object.keys(t.fields).join(',')}`)).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
