import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createBackup, verifyRestore } from './backup.mjs';
import { migrate } from './migrate.mjs';

// CI가 생성한 로컬 서비스 DB만 허용한다. 운영 주소나 운영 백업을 받지 않는다.
const base = new URL(process.env.TEST_DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(base.hostname), 'Local test DB required');
const adminUrl = new URL(base); adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.href });
const names = ['source', 'restore'].map((kind) => `jmh_rehearsal_${kind}_${randomBytes(6).toString('hex')}`);
const urlFor = (name) => { const u = new URL(base); u.pathname = `/${name}`; return u.href; };
const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-recovery-'));
const created = [];
const snapshot = async (url) => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const queries = [
      'select id, name, email from "user" order by id',
      'select id, token, "userId" from session order by id',
      'select id, game_name, tag_line, created_by from members order by id',
      'select day::text, path, views from page_views order by day, path',
      'select name, checksum from schema_migrations order by name',
    ];
    const rows = [];
    for (const query of queries) rows.push((await client.query(query)).rows);
    return rows;
  } finally { await client.end(); }
};
try {
  await admin.connect();
  for (const name of names) { await admin.query(`create database "${name}"`); created.push(name); }
  const [source, target] = names.map(urlFor);
  await migrate({ url: source });
  const client = new pg.Client({ connectionString: source });
  await client.connect();
  try {
    await client.query(`insert into "user" (id, name, email, "emailVerified") values ('recovery_fake', '복구 테스트', 'fake@example.invalid', false)`);
    await client.query(`insert into session (id, token, "userId", "expiresAt", "createdAt", "updatedAt") values ('fake_session', 'fake_token', 'recovery_fake', now() + interval '1 day', now(), now())`);
    await client.query(`insert into members (id, game_name, tag_line, created_by) values ('fake_member', '가짜 소환사', 'KR1', 'recovery_fake')`);
    await client.query(`insert into page_views (day, path, views) values ('2026-01-01', '/fake', 7)`);
  } finally { await client.end(); }
  const expected = await snapshot(source);
  const file = path.join(directory, 'fake.dump');
  await createBackup({ url: source, file });
  const report = await verifyRestore({ sourceUrl: source, targetUrl: target, file, confirmIsolated: true });
  assert.deepEqual(await snapshot(target), expected, 'Restored data and migration checksums must match');
  assert.equal(report.users, 1); assert.equal(report.members, 1); assert.equal(report.view_rows, 1);
  const summary = 'PASS: pg_dump → pg_restore; 사용자·세션·소환사·열람 데이터와 마이그레이션 체크섬 일치';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Recovery rehearsal\n\n${summary}\n`);
} finally {
  try { for (const name of created) await admin.query(`drop database if exists "${name}" with (force)`); }
  finally { await admin.end(); await rm(directory, { recursive: true, force: true }); }
}
