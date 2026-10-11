import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setHomeCacheAge } from '../e2e/cache-age';

const directories: string[] = [];
async function fixture(count = 6) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-cache-age-'));
  directories.push(directory);
  const content = JSON.stringify({ kind: 'FETCH', revalidate: 60, data: { body: 'fixture' } });
  for (let index = 0; index < count; index++) await writeFile(path.join(directory, String(index)), content);
  return { directory, content };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('home cache age fixture', () => {
  it.each([55, 65])('sets only cache timestamps to %s seconds old', async (seconds) => {
    const { directory, content } = await fixture();
    const before = Date.now();
    await setHomeCacheAge(seconds, directory);
    const after = Date.now();
    for (let index = 0; index < 6; index++) {
      const file = path.join(directory, String(index));
      expect(await readFile(file, 'utf8')).toBe(content);
      const { mtimeMs } = await stat(file);
      expect(mtimeMs + seconds * 1000).toBeGreaterThanOrEqual(before - 1);
      expect(mtimeMs + seconds * 1000).toBeLessThanOrEqual(after + 1);
    }
  });

  it.each([0, 5, 7])('rejects missing or unexpected entries (%s)', async (count) => {
    const { directory } = await fixture(count);
    await expect(setHomeCacheAge(65, directory)).rejects.toThrow('six home cache entries');
  });

  it.each([
    { kind: 'FETCH', revalidate: 30 },
    { kind: 'FETCH', revalidate: 120 },
    { kind: 'FETCH', revalidate: false },
    { kind: 'APP_PAGE', revalidate: 60 },
    null,
  ])('rejects TTL or format drift before changing timestamps (%j)', async (entry) => {
    const { directory } = await fixture();
    const first = path.join(directory, '0');
    const before = (await stat(first)).mtimeMs;
    await writeFile(path.join(directory, '5'), JSON.stringify(entry));
    await expect(setHomeCacheAge(65, directory)).rejects.toThrow('production 60-second TTL');
    expect((await stat(first)).mtimeMs).toBe(before);
  });

  it.each([-1, Infinity, NaN])('rejects invalid age %s', async (seconds) => {
    const { directory } = await fixture();
    await expect(setHomeCacheAge(seconds, directory)).rejects.toThrow('finite non-negative');
  });
});
