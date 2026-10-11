import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createBackup, verifyRestore } from './backup.mjs';
import { encryptBackup, decryptBackup, validateBackupKey } from './backup-crypto.mjs';
import { pathToFileURL } from 'node:url';

// 복원 대상은 CI가 직접 만든 로컬 DB로 한정하고 운영 DB는 pg_dump로 읽기만 한다.
export async function backupCycle({ sourceUrl, testUrl, key, outputDirectory, restoreFile }) {
  if (!sourceUrl || !testUrl || !key) throw new Error('Backup automation unconfigured');
  validateBackupKey(key);
  const test = new URL(testUrl);
  if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(test.hostname)) throw new Error('Local restore DB required');
  const adminUrl = new URL(test); adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const name = `jmh_backup_verify_${randomBytes(6).toString('hex')}`;
  const target = new URL(test); target.pathname = `/${name}`;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-backup-cycle-'));
  let created = false;
  try {
    await admin.connect(); await admin.query(`create database "${name}"`); created = true;
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    const raw = path.join(directory, 'source.dump');
    const encrypted = path.join(outputDirectory, 'backup.dump.aes');
    if (!restoreFile) {
      await createBackup({ url: sourceUrl, file: raw });
      await encryptBackup({ file: raw, output: encrypted, key });
    }
    const recovered = path.join(directory, 'recovered.dump');
    await decryptBackup({ file: restoreFile ?? encrypted, output: recovered, key });
    const report = await verifyRestore({ sourceUrl, targetUrl: target.href, file: recovered, confirmIsolated: true });
    // 개인 데이터·연결 주소·비밀값은 검증 보고서에 기록하지 않는다.
    const summary = { version: 1, verifiedAt: report.verifiedAt, migrations: report.migrations, encrypted: true };
    await writeFile(path.join(outputDirectory, 'verification.json'), JSON.stringify(summary), { flag: 'wx', mode: 0o600 });
    return summary;
  } finally {
    try { if (created) await admin.query(`drop database if exists "${name}" with (force)`); }
    finally { await admin.end(); await rm(directory, { recursive: true, force: true }); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const restoreDirectory = process.argv[2] === 'verify-stored' ? process.argv[3] : undefined;
  const run = async () => {
    const names = restoreDirectory ? await readdir(restoreDirectory) : [];
    const files = names.filter(name => name.endsWith('.dump.aes'));
    if (restoreDirectory && files.length !== 1) throw new Error('Stored backup selection invalid');
    return backupCycle({ sourceUrl: process.env.DATABASE_URL_UNPOOLED, testUrl: process.env.TEST_DATABASE_URL,
      key: process.env.BACKUP_ENCRYPTION_KEY, outputDirectory: process.env.BACKUP_OUTPUT_DIRECTORY ?? 'output/backup',
      ...(restoreDirectory ? { restoreFile: path.join(restoreDirectory, files[0]) } : {}) });
  };
  run().then(report => console.log(`[backup] verified ${report.verifiedAt}`)).catch(() => { console.error('[backup] creation/encryption/isolated restore failed; check protected configuration and job stage'); process.exitCode = 1; });
}
