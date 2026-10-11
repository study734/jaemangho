import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encryptBackup, decryptBackup } from './backup-crypto.mjs';
import { notifyWorkflow } from './workflow-notify.mjs';
import { backupCycle } from './backup-cycle.mjs';
import { guardDeployment, PROJECT } from './deployment-guard.mjs';

describe('암호화 백업', () => {
  it('대용량 왕복·변조·키 불일치·기존 파일 보호를 확인한다', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-crypto-test-'));
    const file = path.join(directory, 'raw'); const encrypted = path.join(directory, 'encrypted'); const restored = path.join(directory, 'restored');
    const key = randomBytes(32).toString('base64'); const content = randomBytes(300_000);
    try {
      await writeFile(file, content); const digest = createHash('sha256').update(content).digest('hex'); await writeFile(`${file}.sha256`, digest);
      await encryptBackup({ file, output: encrypted, key });
      await decryptBackup({ file: encrypted, output: restored, key });
      expect(await readFile(restored)).toEqual(content); expect(await readFile(`${restored}.sha256`, 'utf8')).toBe(digest);
      await expect(decryptBackup({ file: encrypted, output: restored, key })).rejects.toThrow();
      expect(await readFile(restored)).toEqual(content);
      await expect(encryptBackup({ file, output: encrypted, key })).rejects.toThrow();
      const wrong = path.join(directory, 'wrong');
      await expect(decryptBackup({ file: encrypted, output: wrong, key: randomBytes(32).toString('base64') })).rejects.toThrow();
      await expect(access(wrong)).rejects.toThrow(); await expect(access(`${wrong}.sha256`)).rejects.toThrow();
      const original = await readFile(encrypted);
      for (const offset of [10, 22, 100, original.length - 1]) {
        const modified = Buffer.from(original); modified[offset] ^= 1; await writeFile(encrypted, modified);
        await expect(decryptBackup({ file: encrypted, output: wrong, key })).rejects.toThrow();
        await expect(access(wrong)).rejects.toThrow();
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('잘못된 키와 외부 복원 DB는 연결 전에 거부한다', async () => {
    const opts = { sourceUrl: 'postgres://user@source/main', testUrl: 'postgres://user@remote/test', outputDirectory: '/tmp/unused' };
    await expect(backupCycle({ ...opts, key: 'invalid' })).rejects.toThrow('key invalid');
    await expect(backupCycle({ ...opts, key: randomBytes(32).toString('base64') })).rejects.toThrow('Local restore');
  });
});

const sha = character => character.repeat(40);
const deployment = (id, character) => ({ id, projectId: PROJECT, target: 'production', readyState: 'READY', url: `${id.replaceAll("_", "-")}.vercel.app`, meta: { githubCommitRef: 'main', githubCommitSha: sha(character), githubCommitOrg: 'study734', githubCommitRepo: 'jaemangho' } });
function fixture({ healthy = false, previousHealthy = true, compatible = true, loseResponse = false, rejectPromotion = false } = {}) {
  const current = deployment('dpl_new', 'a'), previous = deployment('dpl_old', 'b');
  let active = current; const mutations = []; const persisted = [];
  const fetchFn = async (input, init) => {
    const url = new URL(input); expect(url.hostname).toBe('api.vercel.com'); expect(init.redirect).toBe('error');
    if (init.method === 'POST') {
      mutations.push(url.pathname);
      if (url.pathname.includes('/rollback/')) { active = previous; if (loseResponse) throw new Error('response lost'); }
      if (url.pathname.includes('/promote/') && rejectPromotion) return new Response(null, { status: 403 });
      return Response.json({});
    }
    if (url.pathname === '/v6/deployments') return Response.json({ deployments: [{ uid: previous.id }] });
    if (url.pathname.endsWith(previous.id)) return Response.json(previous);
    return Response.json(active);
  };
  return { current, previous, mutations, persisted, options: { token: 'test-token', rollbackEnabled: true, fetchFn,
    state: { good: { id: previous.id, sha: sha('b') } }, persist: async state => { persisted.push(state); }, sleep: async () => {}, compatible: () => compatible,
    probe: async url => [{ ok: url.includes(previous.id.replaceAll("_", "-")) ? previousHealthy : healthy || active.id === previous.id }] } };
}
describe('배포 자동 복구 안전 조건', () => {
  it('정상 배포를 저장하고 API 변경을 하지 않는다', async () => {
    const f = fixture({ healthy: true }); expect((await guardDeployment(f.options)).status).toBe('healthy'); expect(f.mutations).toEqual([]); expect(f.persisted[0].good.id).toBe(f.current.id);
  });
  it.each([{ compatible: false }, { previousHealthy: false }])('스키마 차이·기반 장애 시 롤백하지 않는다: %j', async opts => {
    const f = fixture(opts); expect((await guardDeployment(f.options)).status).toBe('manual_required'); expect(f.mutations).toEqual([]);
  });
  it('응답 유실에도 한 번만 롤백하고 같은 정상 버전의 자동 배포를 재개한다', async () => {
    const f = fixture({ loseResponse: true }); expect((await guardDeployment(f.options)).status).toBe('recovered');
    expect(f.mutations).toEqual([`/v1/projects/${PROJECT}/rollback/dpl_old`, `/v10/projects/${PROJECT}/promote/dpl_old`]);
    expect(f.persisted[0].attempted.id).toBe(f.current.id); expect(f.persisted.at(-1).good.id).toBe(f.previous.id);
  });
  it('롤백 후 재승격 거부는 수동 조치로 남긴다', async () => {
    const f = fixture({ rejectPromotion: true }); expect((await guardDeployment(f.options)).reason).toBe('rollback_succeeded_auto_assignment_pending');
  });
  it.each(['disabled', 'missing', 'attempted', 'wrong-project', 'wrong-branch', 'wrong-repository', 'race'])('%s 안전 조건을 확인한다', async mode => {
    const f = fixture();
    if (mode === 'disabled') f.options.rollbackEnabled = false;
    if (mode === 'missing') f.options.state = {};
    if (mode === 'attempted') f.options.state.attempted = { id: f.current.id };
    if (mode === 'wrong-project') f.current.projectId = 'other';
    if (mode === 'wrong-branch') f.current.meta.githubCommitRef = 'feature';
    if (mode === 'wrong-repository') f.current.meta.githubCommitRepo = 'other';
    if (mode === 'race') { const original = f.options.fetchFn; let calls = 0; f.options.fetchFn = async (...args) => { if (String(args[0]).includes('jaemangho.vercel.app') && ++calls > 1) return Response.json(deployment('dpl_race', 'c')); return original(...args); }; }
    expect(['manual_required', 'superseded']).toContain((await guardDeployment(f.options)).status); expect(f.mutations).toEqual([]);
  });
});

describe('워크플로 개입 알림', () => {
  it('정상은 조용히 기록하고 장애·복구 전환만 보낸다', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-notify-test-'));
    const sent = []; const options = { kind: 'backup', stateFile: path.join(directory, 'state.json'), runId: '123', webhook: 'https://discord.com/api/webhooks/123456789012345678/token', fetchFn: async (_url, init) => { sent.push(String(init.body)); return new Response(null, { status: 204 }); } };
    try {
      await notifyWorkflow({ ...options, status: 'healthy' }); expect(sent).toHaveLength(0);
      await notifyWorkflow({ ...options, status: 'failed' }); await notifyWorkflow({ ...options, status: 'failed' });
      expect(sent).toHaveLength(1); expect(sent[0]).toContain('actions/runs/123');
      await notifyWorkflow({ ...options, status: 'healthy' }); expect(sent).toHaveLength(2);
      expect(await readFile(options.stateFile, 'utf8')).not.toContain('token');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('전송 실패 시 상태를 유지하여 재시도하고 외부 URL은 거부한다', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jmh-notify-retry-'));
    const options = { kind: 'release', status: 'failed', stateFile: path.join(directory, 'state.json'), webhook: 'https://discord.com/api/webhooks/123456789012345678/token' }; let calls = 0;
    try {
      const fetchFn = async () => { calls++; return new Response(null, { status: calls === 1 ? 503 : 204 }); };
      await expect(notifyWorkflow({ ...options, fetchFn })).rejects.toThrow();
      await expect(access(options.stateFile)).rejects.toThrow();
      await notifyWorkflow({ ...options, fetchFn }); expect(calls).toBe(2);
      await expect(notifyWorkflow({ ...options, status: 'healthy', webhook: 'https://attacker.example', fetchFn })).rejects.toThrow('Invalid'); expect(calls).toBe(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
