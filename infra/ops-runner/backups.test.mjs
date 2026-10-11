import { expect, it } from 'vitest';
import { backupFreshness } from './backups.mjs';
const now = Date.parse('2026-10-11T03:00:00Z');
const artifact = (name, id) => ({ name: `${name}-${id}`, created_at: new Date(now - 10000).toISOString(), expired: false, workflow_run: { head_branch: 'main', id } });
function fixture(mode) {
  const artifacts = [artifact('production-backup', 1), artifact('restore-verification', 2)];
  if (mode === 'expired') artifacts[0].created_at = new Date(now - 37 * 3600000).toISOString();
  if (mode === 'no-restore') artifacts.pop();
  const calls = []; const fetchFn = async input => {
    calls.push(String(input));
    if (mode === 'api-error') return new Response(null, { status: 429 });
    if (String(input).includes('artifacts')) return Response.json({ artifacts });
    return Response.json({ path: `.github/workflows/${String(input).endsWith('/1') ? 'production-backup' : 'production-restore-check'}.yml`, head_branch: 'main', head_repository: { full_name: 'study734/jaemangho' }, event: mode === 'pr' ? 'pull_request' : 'schedule', conclusion: 'success' });
  }; return { calls, fetchFn };
}
it.each([['normal', 'healthy'], ['expired', 'backup_stale'], ['no-restore', 'restore_stale'], ['api-error', 'backup_inspection_failed'], ['pr', 'backup_stale']])('백업 공백과 신뢰할 수 없는 메타데이터를 확인한다: %s', async (mode, status) => {
  const f = fixture(mode); expect((await backupFreshness({ now, fetchFn: f.fetchFn })).status).toBe(status);
});
it('정상 메타데이터는 한 시간, API 실패는 15분 후 다시 확인한다', async () => {
  const f = fixture('normal'); const state = await backupFreshness({ now, fetchFn: f.fetchFn });
  await backupFreshness({ state, now: now + 3599999, fetchFn: f.fetchFn }); expect(f.calls).toHaveLength(3);
  await backupFreshness({ state, now: now + 3600000, fetchFn: f.fetchFn }); expect(f.calls).toHaveLength(6);
  const broken = fixture('api-error'); const error = await backupFreshness({ now, fetchFn: broken.fetchFn });
  await backupFreshness({ state: error, now: now + 900000, fetchFn: broken.fetchFn }); expect(broken.calls).toHaveLength(2);
});

it('완료되지 않은 새 업로드를 건너뛰고 직전 성공을 확인한다', async () => {
  const artifacts = [artifact('production-backup', 3), artifact('production-backup', 1), artifact('restore-verification', 2)];
  const fetchFn = async input => {
    if (String(input).includes('artifacts')) return Response.json({ artifacts });
    return Response.json({ path: `.github/workflows/${String(input).endsWith('/2') ? 'production-restore-check' : 'production-backup'}.yml`, head_branch: 'main', head_repository: { full_name: 'study734/jaemangho' }, event: 'schedule', conclusion: String(input).endsWith('/3') ? null : 'success' });
  };
  expect((await backupFreshness({ now, fetchFn })).status).toBe('healthy');
});
