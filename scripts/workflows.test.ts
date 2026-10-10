import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkMigrations } from './check-migrations.mjs';
import { probeSmoke } from './smoke.mjs';

describe('마이그레이션 변경 보호', () => {
  it.each(['modify', 'delete', 'rename', 'old-number', 'duplicate', 'valid'])('%s 변경을 실제 Git 이력으로 확인한다', async (change) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-policy-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
    const commit = () => { git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'); };
    try {
      git('init', '-q'); await mkdir(path.join(directory, 'migrations'));
      const original = path.join(directory, 'migrations/0002_existing.sql');
      await writeFile(original, 'select 1;'); commit(); const base = git('rev-parse', 'HEAD');
      if (change === 'modify') await writeFile(original, 'select 2;');
      if (change === 'delete' || change === 'rename') await rm(original);
      if (change === 'rename') await writeFile(path.join(directory, 'migrations/0003_renamed.sql'), 'select 1;');
      if (change === 'old-number') await writeFile(path.join(directory, 'migrations/0001_old.sql'), 'select 1;');
      if (change === 'duplicate' || change === 'valid') await writeFile(path.join(directory, 'migrations/0003_next.sql'), 'select 1;');
      if (change === 'duplicate') await writeFile(path.join(directory, 'migrations/0003_other.sql'), 'select 1;');
      commit();
      if (change === 'valid') expect(checkMigrations(base, 'HEAD', directory)).toEqual(['migrations/0003_next.sql']);
      else expect(() => checkMigrations(base, 'HEAD', directory)).toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe('운영 배포 확인', () => {
  const responses = (broken?: string) => async (input: string | URL | Request, init?: RequestInit) => {
    expect(init?.redirect).toBe('manual');
    const route = new URL(String(input)).pathname;
    if (route === broken) return new Response('broken', { status: 200 });
    if (route === '/api/health') return Response.json({ ok: true });
    if (route === '/login') return new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } });
    if (route === '/') return new Response(null, { status: 307, headers: { Location: '/login' } });
    return new Response(null, { status: 401 });
  };
  it('정상 헬스·로그인·비로그인 차단을 확인한다', async () => {
    expect((await probeSmoke('https://site.example', responses())).every((r) => r.ok)).toBe(true);
  });
  it.each(['/api/health', '/login', '/', '/api/members', '/api/admin'])('%s가 잘못 응답하면 실패한다', async (route) => {
    expect((await probeSmoke('https://site.example', responses(route))).find((r) => r.path === route)?.ok).toBe(false);
  });
  it('헬스 HTTP 200만으로 DB 정상이라고 판단하지 않는다', async () => {
    expect((await probeSmoke('https://site.example', async () => Response.json({ ok: false })))[0].ok).toBe(false);
  });
});
