import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '');

// 스키마는 첫 호출 때 한 번 만든다 (마이그레이션 도구 없이 시작).
// ponytail: 테이블이 늘어나면 정식 마이그레이션 도구로 전환.
let ready;
export async function db() {
  ready ??= (async () => {
    await sql`create table if not exists members (
      id text primary key,
      game_name text not null,
      tag_line text not null,
      created_by text,
      created_at timestamptz not null default now()
    )`;
    await sql`create unique index if not exists members_riot_id
      on members (lower(game_name), lower(tag_line))`;
    await sql`create table if not exists users (
      id text primary key,
      name text not null,
      is_admin boolean not null default false,
      blocked boolean not null default false,
      login_count int not null default 1,
      first_login timestamptz not null default now(),
      last_login timestamptz not null default now()
    )`;
    await sql`create table if not exists riot_errors (
      at timestamptz not null default now(),
      status int not null,
      path text not null
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
