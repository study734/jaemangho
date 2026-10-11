import { readdir, readFile, utimes } from 'node:fs/promises';
import path from 'node:path';

// Next.js's file cache reads freshness from mtime when the E2E build disables
// its memory cache. Change only that input; leave cache contents and TTL intact.
// Fail on a changed cache format instead of silently skipping expiry coverage.
export async function setHomeCacheAge(seconds: number, directory = '.next/cache/fetch-cache') {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Cache age must be a finite non-negative number');
  const files = await readdir(directory, { withFileTypes: true });
  if (files.length !== 6 || files.some((file) => !file.isFile())) {
    throw new Error(`Expected the six home cache entries, found ${files.length}`);
  }
  const paths = files.map((file) => path.join(directory, file.name));
  for (const file of paths) {
    const entry: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!entry || typeof entry !== 'object' || !('kind' in entry) || entry.kind !== 'FETCH'
      || !('revalidate' in entry) || entry.revalidate !== 60) {
      throw new Error('Expected a Next.js FETCH cache entry with the production 60-second TTL');
    }
  }
  const now = new Date();
  const modified = new Date(now.getTime() - seconds * 1000);
  await Promise.all(paths.map((file) => utimes(file, now, modified)));
}
