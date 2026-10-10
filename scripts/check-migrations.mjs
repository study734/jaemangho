import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function checkMigrations(base, head = 'HEAD', cwd = process.cwd()) {
  if (![base, head].every((ref) => /^(?:[a-f0-9]{40}|HEAD)$/.test(ref))) throw new Error('Commit SHA required');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const previous = git('ls-tree', '-r', '--name-only', '-z', base, '--', 'migrations').split('\0').filter((p) => p.endsWith('.sql'));
  const max = Math.max(0, ...previous.map((p) => Number(p.match(/\/(\d{4})_/)?.[1] ?? 0)));
  const changes = git('diff', '--no-renames', '--name-status', '-z', base, head, '--', 'migrations').split('\0');
  const added = [];
  const numbers = new Set();
  for (let i = 0; i < changes.length - 1; i += 2) {
    const [status, file] = [changes[i], changes[i + 1]];
    if (!file.endsWith('.sql')) continue;
    if (status !== 'A') throw new Error(`기존 마이그레이션 수정·삭제 금지: ${file}`);
    const match = file.match(/^migrations\/(\d{4})_[\w-]+\.sql$/);
    if (!match || Number(match[1]) <= max || numbers.has(match[1])) throw new Error(`새 마이그레이션 이름·번호 확인: ${file}`);
    numbers.add(match[1]); added.push(file);
  }
  return added;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(`[migrations] protected; ${checkMigrations(process.argv[2], process.argv[3]).length} new files`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
