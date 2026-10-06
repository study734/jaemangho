import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { monitor } from '../../../scripts/monitor.mjs';
import { connectionEnv, createBackup, sameDatabase, verifyRestore } from '../../../scripts/backup.mjs';

describe('독립 운영 감시', () => {
  it('지속 장애는 한번만 알리고 복구를 알린다', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-monitor-'));
    const stateFile = path.join(directory, 'state.json');
    let healthy = false;
    const sent: string[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('webhooks')) { sent.push(String(init?.body)); return new Response(null, { status: 204 }); }
      return new Response('{}', { status: healthy ? 200 : 503 });
    });
    const options = { url: 'https://site.example', stateFile, secret: 'secret', webhook: 'https://discord.com/api/webhooks/123456789012345678/token', fetchFn };
    try {
      expect((await monitor(options)).status).toBe('unavailable');
      await monitor(options);
      expect(sent).toHaveLength(1);
      healthy = true;
      expect((await monitor(options)).status).toBe('healthy');
      expect(sent).toHaveLength(2);
      expect(sent[1]).toContain('복구');
      expect(await readFile(stateFile, 'utf8')).not.toContain('secret');
    } finally { await rm(directory, { recursive: true }); }
  });
  it('전송 실패는 다음 실행에서 재시도한다', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-monitor-'));
    let deliveries = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('webhooks')) { deliveries++; return new Response(null, { status: deliveries === 1 ? 503 : 204 }); }
      return new Response(null, { status: 503 });
    });
    const options = { url: 'https://site.example', stateFile: path.join(directory, 'state.json'), webhook: 'https://discord.com/api/webhooks/123456789012345678/token', fetchFn };
    try {
      expect((await monitor(options)).notificationFailed).toBe(true);
      expect((await monitor(options)).notificationFailed).toBe(false);
      await monitor(options);
      expect(deliveries).toBe(2);
    } finally { await rm(directory, { recursive: true }); }
  });
});

describe('백업과 격리 복구 보호', () => {
  it('연결 정보를 PG 환경으로 전달하고 비밀번호를 해석한다', () => {
    const env = connectionEnv('postgres://admin:p%40ss@db.example:5433/main?sslmode=require', {});
    expect(env).toMatchObject({ PGHOST: 'db.example', PGPORT: '5433', PGUSER: 'admin', PGPASSWORD: 'p@ss', PGDATABASE: 'main', PGSSLMODE: 'require' });
  });
  it('사용자나 SSL 옵션만 달라진 동일 DB를 거부한다', () => {
    expect(sameDatabase('postgres://a@db.example/main', 'postgresql://b@db.example:5432/main?sslmode=require')).toBe(true);
  });
  it('확인되지 않은 대상과 원본 DB에는 연결하기 전에 중단한다', async () => {
    await expect(verifyRestore({ sourceUrl: 'postgres://a@host/main', targetUrl: 'postgres://b@host/main', file: 'no-file', confirmIsolated: true })).rejects.toThrow('원본과 다른');
    await expect(verifyRestore({ sourceUrl: 'postgres://a@host/main', targetUrl: 'postgres://a@host/test', file: 'no-file', confirmIsolated: false })).rejects.toThrow('--confirm-isolated');
  });
  it('풀링 주소로 백업이나 복구를 실행하지 않는다', async () => {
    await expect(createBackup({ url: 'postgres://user@ep-example-pooler.neon.tech/main', file: 'no-file' })).rejects.toThrow('직접 연결');
    await expect(verifyRestore({ sourceUrl: 'postgres://user@ep-example.neon.tech/main', targetUrl: 'postgres://user@ep-example-pooler.neon.tech/test', file: 'no-file', confirmIsolated: true })).rejects.toThrow('직접 연결');
  });
});
