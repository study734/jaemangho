import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// GitHub Free 500 MB 중 이 저장소의 산출물은 400 MB 이내로 제한한다.
// 다른 저장소·Packages 사용량은 이 토큰으로 알 수 없으므로 계정 사용량 확인도 필요하다.
const LIMIT = 400_000_000;
const BACKUP_LIMIT = 10_000_000;
const RETENTION = 30;
const uploadSize = bytes => Math.ceil(bytes * 1.02) + 65_536;
// GitHub 목록 API가 total_count보다 적게 돌려주는 경우가 있다(2026-11-27: 46개 중 45개, 마지막 페이지 빈 배열).
// 몇 개 빠진 정도면 각각을 백업 상한 크기로 넉넉히 세고 계속한다. 그보다 많이 빠지면 용량을 알 수 없으므로 멈춘다.
const MAX_UNCOUNTED = 3;

export async function backupBudget({ bytes, fetchFn = fetch, token }) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Backup size invalid');
  if (bytes > BACKUP_LIMIT) throw new Error('Encrypted backup exceeds 10 MB free storage budget; review retention or storage before uploading');
  let artifacts = [];
  let uncounted = 0;
  for (let page = 1; page <= 20; page++) {
    const response = await fetchFn(`https://api.github.com/repos/study734/jaemangho/actions/artifacts?per_page=100&page=${page}`,
      { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) throw new Error('Artifact storage inspection failed; upload stopped');
    const result = await response.json();
    if (!Array.isArray(result.artifacts) || !Number.isSafeInteger(result.total_count)) throw new Error('Artifact storage metadata invalid');
    artifacts.push(...result.artifacts);
    if (artifacts.length >= result.total_count) break;
    if (result.artifacts.length === 0 && result.total_count - artifacts.length <= MAX_UNCOUNTED) { uncounted = result.total_count - artifacts.length; break; }
    if (result.artifacts.length === 0 || page === 20) throw new Error('Artifact storage inspection incomplete; upload stopped');
  }
  artifacts = artifacts.filter(a => !a.expired);
  if (artifacts.some(a => !Number.isSafeInteger(a.size_in_bytes) || a.size_in_bytes < 0 || typeof a.name !== 'string')) throw new Error('Artifact size metadata invalid');
  const used = artifacts.reduce((sum, a) => sum + a.size_in_bytes, 0) + uncounted * BACKUP_LIMIT;
  const others = artifacts.filter(a => !/^production-backup-[0-9]+$/.test(a.name)).reduce((sum, a) => sum + a.size_in_bytes, 0) + uncounted * BACKUP_LIMIT;
  const largest = Math.max(uploadSize(bytes), ...artifacts.filter(a => /^production-backup-[0-9]+$/.test(a.name)).map(a => a.size_in_bytes));
  const projected = Math.max(used + uploadSize(bytes), others + RETENTION * largest);
  if (projected > LIMIT) throw new Error('Artifact storage would exceed 400 MB repository budget; upload stopped, existing backups preserved');
  return { usedBytes: used, backupBytes: bytes, projectedBytes: projected, budgetBytes: LIMIT, retentionDays: RETENTION, uncountedArtifacts: uncounted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const directory = 'output/backup';
    const files = await readdir(directory);
    if (files.length !== 2 || !files.includes('backup.dump.aes') || !files.includes('verification.json')) throw new Error('Verified backup file selection invalid');
    const sizes = await Promise.all(files.map(async name => {
      const file = await stat(path.join(directory, name));
      if (!file.isFile()) throw new Error('Backup must be a regular file');
      return file.size;
    }));
    console.log(JSON.stringify(await backupBudget({ bytes: sizes.reduce((sum, size) => sum + size, 0), token: process.env.GITHUB_TOKEN })));
  } catch (error) { console.error(`[backup-budget] ${error.message}`); process.exitCode = 1; }
}
