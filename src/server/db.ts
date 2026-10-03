import { getMigrations } from 'better-auth/db/migration';
import { auth } from './auth';
import { pool } from './pool';

// neon의 sql`...` 태그와 같은 모양으로 쓰는 파라미터 쿼리: sql`select * from t where id = ${id}` -> 행 배열
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

const sql: Sql = async (strings, ...values) => {
  const text = strings.reduce((acc, part, i) => `${acc}$${i}${part}`);
  return (await pool.query(text, values)).rows;
};

// 스키마는 첫 호출 때 한 번 만든다: 로그인 라이브러리(user/session/account/verification) + 앱 테이블.
// ponytail: 테이블이 늘어나면 정식 마이그레이션 도구(Drizzle)로 전환.
let ready: Promise<void> | undefined;
export async function db(): Promise<Sql> {
  ready ??= (async () => {
    await (await getMigrations(auth.options)).runMigrations();
    await sql`create table if not exists members (
      id text primary key,
      game_name text not null,
      tag_line text not null,
      created_by text,
      created_by_name text,
      created_at timestamptz not null default now()
    )`;
    await sql`create unique index if not exists members_riot_id
      on members (lower(game_name), lower(tag_line))`;
    await sql`alter table members add column if not exists created_by_name text`;
    await sql`create table if not exists riot_errors (
      at timestamptz not null default now(),
      status int not null,
      path text not null
    )`;
    await sql`create table if not exists riot_stats (
      day date primary key,
      hits int not null default 0,
      misses int not null default 0
    )`;
    await sql`create table if not exists riot_cache (
      key text primary key,
      status int not null,
      body jsonb not null,
      expires_at timestamptz not null
    )`;
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  await ready;
  return sql;
}
