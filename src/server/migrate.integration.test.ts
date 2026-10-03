import { readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/migrate.mjs';
import { createScratchDb, testDbUrl } from './testing/db';

// 실행기(scripts/migrate.mjs)와 실제 migrations/ 폴더를 일회용 데이터베이스에서 시험한다.
describe.skipIf(!testDbUrl)('DB 마이그레이션', () => {
  const dropFns: (() => Promise<void>)[] = [];
  const tmpDirs: string[] = [];

  async function scratch() {
    const db = await createScratchDb();
    dropFns.push(db.drop);
    return db.url;
  }
  async function query<T extends pg.QueryResultRow = Record<string, unknown>>(url: string, text: string) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query<T>(text)).rows;
    } finally {
      await client.end();
    }
  }
  async function migrationsDir(files: Record<string, string>) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jmh-migrations-'));
    tmpDirs.push(dir);
    for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql);
    return dir;
  }
  const tableExists = async (url: string, table: string) =>
    (await query(url, `select to_regclass('public."${table}"') as t`))[0].t !== null;

  beforeAll(() => {});
  afterAll(async () => {
    for (const drop of dropFns) await drop();
    for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
  });

  describe('실제 migrations/ 폴더', () => {
    it('빈 DB에 모든 테이블을 만들고, 다시 실행하면 아무것도 하지 않는다', async () => {
      const url = await scratch();
      const first = await migrate({ url });
      expect(first).toEqual(readdirSync('migrations').filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort());
      for (const table of ['user', 'session', 'account', 'verification', 'members', 'riot_cache', 'riot_errors', 'riot_stats', 'schema_migrations']) {
        expect(await tableExists(url, table), table).toBe(true);
      }
      expect(await migrate({ url })).toEqual([]);
    });

    it('0002: 예전 users(복수형) 테이블만 지우고 현재 로그인 user(단수형)와 다른 데이터는 건드리지 않는다', async () => {
      const url = await scratch();
      // 예전 버전이 만든 DB: users 테이블(디스코드 ID 기반 접속 기록)과 소환사 목록
      await query(url, `create table users (id text primary key, name text, login_count int)`);
      await query(url, `insert into users values ('111', '예전기록', 7)`);
      await query(url, `create table members (id text primary key, game_name text not null, tag_line text not null, created_by text, created_at timestamptz not null default now())`);
      await query(url, `insert into members (id, game_name, tag_line) values ('keep1', 'Faker', 'KR1')`);

      await migrate({ url });
      expect(await tableExists(url, 'users')).toBe(false);
      expect(await tableExists(url, 'user')).toBe(true); // 이름이 비슷한 현재 테이블은 그대로
      expect(await query(url, `select id from members`)).toEqual([{ id: 'keep1' }]);

      await query(url, `insert into "user" (id, name, email, "emailVerified") values ('u1', '이름', 'a@b.invalid', false)`);
      expect(await migrate({ url })).toEqual([]); // 다시 실행해도 아무 일도 없고 "user" 데이터는 남는다
      expect(await query(url, `select id from "user"`)).toEqual([{ id: 'u1' }]);
    });

    it('예전 방식(런타임 생성)으로 만들어진 DB에 올려도 데이터가 보존되고 부족한 컬럼이 채워진다', async () => {
      const url = await scratch();
      // 예전 members 테이블: created_by_name 컬럼이 없던 시절 + 데이터 1건
      await query(url, `create table members (id text primary key, game_name text not null, tag_line text not null, created_by text, created_at timestamptz not null default now())`);
      await query(url, `insert into members (id, game_name, tag_line, created_by) values ('old1', 'Faker', 'KR1', '123')`);

      await migrate({ url });

      const rows = await query<{ id: string; created_by: string; created_by_name: string | null }>(url, `select id, created_by, created_by_name from members`);
      expect(rows).toEqual([{ id: 'old1', created_by: '123', created_by_name: null }]);
      const index = await query(url, `select 1 from pg_indexes where indexname = 'members_riot_id'`);
      expect(index).toHaveLength(1);
    });
  });

  describe('실행기 동작', () => {
    it('번호순으로 적용하고 형식에 맞지 않는 파일은 무시한다', async () => {
      const url = await scratch();
      const dir = await migrationsDir({
        '0002_second.sql': `insert into t values (2);`,
        '0001_first.sql': `create table t (n int); insert into t values (1);`,
        'notes.sql': `drop table t;`,
        'README.md': `무시`,
      });
      expect(await migrate({ url, dir })).toEqual(['0001_first.sql', '0002_second.sql']);
      expect((await query<{ n: number }>(url, `select n from t order by n`)).map((r) => r.n)).toEqual([1, 2]);
    });

    it('새 파일만 추가로 적용한다', async () => {
      const url = await scratch();
      const dir = await migrationsDir({ '0001_a.sql': `create table a (n int);` });
      await migrate({ url, dir });
      await writeFile(path.join(dir, '0002_b.sql'), `create table b (n int);`);
      expect(await migrate({ url, dir })).toEqual(['0002_b.sql']);
    });

    it('이미 적용된 파일이 수정되면 실패한다', async () => {
      const url = await scratch();
      const dir = await migrationsDir({ '0001_a.sql': `create table a (n int);` });
      await migrate({ url, dir });
      await writeFile(path.join(dir, '0001_a.sql'), `create table a (n int, extra int);`);
      await expect(migrate({ url, dir })).rejects.toThrow('이미 적용된 마이그레이션이 수정되었습니다: 0001_a.sql');
    });

    it('실패한 마이그레이션은 통째로 되돌려지고 기록되지 않는다', async () => {
      const url = await scratch();
      const dir = await migrationsDir({ '0001_bad.sql': `create table half (n int); select * from does_not_exist;` });
      await expect(migrate({ url, dir })).rejects.toThrow(/0001_bad\.sql 적용 실패/);
      expect(await tableExists(url, 'half')).toBe(false);
      expect(await query(url, `select * from schema_migrations`)).toEqual([]);
    });

    it('앞 파일이 성공하고 뒤 파일이 실패하면 앞 파일은 유지된다', async () => {
      const url = await scratch();
      const dir = await migrationsDir({ '0001_ok.sql': `create table ok (n int);`, '0002_bad.sql': `select nope();` });
      await expect(migrate({ url, dir })).rejects.toThrow(/0002_bad\.sql/);
      expect(await tableExists(url, 'ok')).toBe(true);
      expect((await query<{ name: string }>(url, `select name from schema_migrations`)).map((r) => r.name)).toEqual(['0001_ok.sql']);
    });

    it('여러 곳에서 동시에 처음 실행해도 오류 없이 각 파일이 정확히 한 번만 적용된다', async () => {
      const url = await scratch();
      const dir = await migrationsDir({
        '0001_a.sql': `create table counter (n int); insert into counter values (0);`,
        '0002_b.sql': `update counter set n = n + 1;`,
      });
      const results = await Promise.all([1, 2, 3, 4].map(() => migrate({ url, dir })));
      expect(results.flat().sort()).toEqual(['0001_a.sql', '0002_b.sql']);
      expect((await query<{ n: number }>(url, `select n from counter`))[0].n).toBe(1);
    });
  });
});
