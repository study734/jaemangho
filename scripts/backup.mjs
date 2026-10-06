import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { migrate } from './migrate.mjs';

// 연결 정보는 환경으로 전달하고 명령 인수와 오류 출력에 포함하지 않는다.
export function connectionEnv(url, original = process.env) {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) throw new Error('Invalid database URL');
  return { ...original, PGHOST: parsed.hostname, PGPORT: parsed.port || '5432', PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password), PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: parsed.searchParams.get('sslmode') ?? (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) ? 'disable' : 'require'), PGCONNECT_TIMEOUT: '10' };
}

export function sameDatabase(a, b) {
  const identity = (url) => { const e = connectionEnv(url, {}); return `${e.PGHOST.toLowerCase()}:${e.PGPORT}/${e.PGDATABASE}`; };
  return identity(a) === identity(b);
}

const runTool = (name, args, env) => new Promise((resolve, reject) => {
  const child = spawn(name, args, { env, stdio: ['ignore', 'ignore', 'ignore'] });
  child.once('error', () => reject(new Error(`${name}: 실행 도구를 찾을 수 없거나 시작하지 못했습니다`)));
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${name}: 실행 실패. DB 접근 권한과 도구 버전을 확인하세요`)));
});

const checksum = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

export async function createBackup({ url, file }) {
  if (!url) throw new Error('DB 주소가 설정되지 않았습니다');
  const env = connectionEnv(url);
  file = path.resolve(file);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const backup = await open(file, 'wx', 0o600); // 기존 파일과 심볼릭 링크는 덮어쓰지 않는다.
  await backup.close();
  let manifest;
  try {
    manifest = await open(`${file}.sha256`, 'wx', 0o600);
    await runTool('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', file], env);
    await chmod(file, 0o600);
    const digest = await checksum(file);
    await manifest.writeFile(`${digest}\n`);
    return { file: path.basename(file), sha256: digest };
  } catch (error) {
    await unlink(file).catch(() => {});
    if (manifest) await unlink(`${file}.sha256`).catch(() => {});
    throw error;
  } finally { await manifest?.close(); }
}

export async function verifyRestore({ sourceUrl, targetUrl, file, confirmIsolated }) {
  if (!confirmIsolated) throw new Error('--confirm-isolated 로 격리된 빈 테스트 DB임을 확인해야 합니다');
  if (!sourceUrl || !targetUrl || sameDatabase(sourceUrl, targetUrl)) throw new Error('원본과 다른 TEST_DATABASE_URL이 필요합니다');
  file = path.resolve(file);
  const expected = (await readFile(`${file}.sha256`, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== await checksum(file)) throw new Error('백업 체크섬이 일치하지 않습니다');
  const client = new pg.Client({ connectionString: targetUrl });
  await client.connect();
  try {
    const tables = await client.query(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    if (tables.rows[0].n) throw new Error('복구 대상 DB가 비어 있지 않습니다. 기존 데이터는 변경하지 않습니다');
    const env = connectionEnv(targetUrl);
    await runTool('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', env.PGDATABASE, file], env);
    await migrate({ url: targetUrl }); // 실제 배포와 같은 체크섬 검증 및 최신 스키마 적용.
    const counts = await client.query(`select (select count(*)::int from "user") as users,
      (select count(*)::int from members) as members, (select count(*)::int from page_views) as view_rows,
      (select count(*)::int from schema_migrations) as migrations`);
    return { verifiedAt: new Date().toISOString(), sha256: expected, ...counts.rows[0] };
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, file, confirmation] = process.argv.slice(2);
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  const run = command === 'create' ? () => createBackup({ url, file }) : command === 'verify' ?
    () => verifyRestore({ sourceUrl: url, targetUrl: process.env.TEST_DATABASE_URL, file, confirmIsolated: confirmation === '--confirm-isolated' }) : null;
  if (!run || !file) { console.error('Usage: backup.mjs create <file> | verify <file> --confirm-isolated'); process.exitCode = 1; }
  else run().then((report) => console.log(JSON.stringify(report))).catch((error) => {
    // PG 연결 오류에 포함될 수 있는 값을 숨기고 알려진 운영 메시지만 출력한다.
    const safe = /^(DB |Invalid database|--confirm-isolated|원본과|백업 체크섬|복구 대상|pg_dump:|pg_restore:)/.test(error.message);
    console.error(safe ? error.message : '백업/복구 검증에 실패했습니다. 파일·DB 접근 권한과 마이그레이션 상태를 확인하세요');
    process.exitCode = 1;
  });
}
