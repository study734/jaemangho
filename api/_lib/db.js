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
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  await ready;
  return sql;
}
