import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createBackup, verifyRestore } from './backup.mjs';
import { encryptBackup, decryptBackup } from './backup-crypto.mjs';
import { backupCycle } from './backup-cycle.mjs';
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
const reader = `jmh_rehearsal_reader_${randomBytes(6).toString('hex')}`;
const readerPassword = randomBytes(24).toString('base64url');
let readerCreated = false;
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
  await admin.query(`create role "${reader}" login password '${readerPassword}' nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
  readerCreated = true;
  await admin.query(`alter role "${reader}" set default_transaction_read_only = on`);
  await admin.query(`grant connect on database "${names[0]}" to "${reader}"`);
  const client = new pg.Client({ connectionString: source });
  await client.connect();
  try {
    await client.query(`insert into "user" (id, name, email, "emailVerified") values ('recovery_fake', '복구 테스트', 'fake@example.invalid', false)`);
    await client.query(`insert into session (id, token, "userId", "expiresAt", "createdAt", "updatedAt") values ('fake_session', 'fake_token', 'recovery_fake', now() + interval '1 day', now(), now())`);
    await client.query(`insert into members (id, game_name, tag_line, created_by) values ('fake_member', '가짜 소환사', 'KR1', 'recovery_fake')`);
    await client.query(`insert into page_views (day, path, views) values ('2026-01-01', '/fake', 7)`);
    // 공급자 관리 스키마를 읽을 수 없어도 앱 데이터만 완전히 백업·복원해야 한다.
    await client.query('create schema managed_auth');
    await client.query('create table managed_auth.private_account(id int)');
    await client.query(`grant usage on schema public to "${reader}"`);
    await client.query(`grant select on all tables in schema public to "${reader}"`);
    await client.query(`grant select on all sequences in schema public to "${reader}"`);
  } finally { await client.end(); }
  const readSource = new URL(source); readSource.username = reader; readSource.password = readerPassword;
  const readonly = new pg.Client({ connectionString: readSource.href });
  await readonly.connect();
  try {
    assert.equal((await readonly.query("select has_schema_privilege(current_user, 'managed_auth', 'USAGE') as allowed")).rows[0].allowed, false);
    assert.equal((await readonly.query("select has_table_privilege(current_user, 'public.members', 'INSERT') as allowed")).rows[0].allowed, false);
  } finally { await readonly.end(); }
  const expected = await snapshot(source);
  const file = path.join(directory, 'fake.dump');
  await createBackup({ url: readSource.href, file });
  const key = randomBytes(32).toString('base64');
  const encrypted = path.join(directory, 'fake.dump.aes');
  const decrypted = path.join(directory, 'decrypted.dump');
  await encryptBackup({ file, output: encrypted, key });
  await decryptBackup({ file: encrypted, output: decrypted, key });
  const report = await verifyRestore({ sourceUrl: source, targetUrl: target, file: decrypted, confirmIsolated: true });
  const outputDirectory = path.join(directory, 'cycle');
  const cycle = await backupCycle({ sourceUrl: readSource.href, testUrl: base.href, key, outputDirectory });
  assert.equal(cycle.migrations, report.migrations);
  const stored = await backupCycle({ sourceUrl: source, testUrl: base.href, key, outputDirectory: path.join(directory, 'stored-check'), restoreFile: path.join(outputDirectory, 'backup.dump.aes') });
  assert.equal(stored.migrations, report.migrations);
  assert.deepEqual(await snapshot(target), expected, 'Restored data and migration checksums must match');
  const restored = new pg.Client({ connectionString: target });
  await restored.connect();
  try { assert.equal((await restored.query("select to_regnamespace('managed_auth') as schema")).rows[0].schema, null); }
  finally { await restored.end(); }
  assert.equal(report.users, 1); assert.equal(report.members, 1); assert.equal(report.view_rows, 1);
  const summary = 'PASS: 읽기 전용 public pg_dump → AES-256-GCM → pg_restore + 보관 파일 재검증; 공급자 관리 스키마 권한 없이 사용자·세션·소환사·열람 데이터와 마이그레이션 체크섬 일치';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Recovery rehearsal\n\n${summary}\n`);
} finally {
  try {
    for (const name of created) await admin.query(`drop database if exists "${name}" with (force)`);
    if (readerCreated) await admin.query(`drop role "${reader}"`);
  }
  finally { await admin.end(); await rm(directory, { recursive: true, force: true }); }
}
