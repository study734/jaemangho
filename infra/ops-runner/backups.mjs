// 공개 저장소의 실행 메타데이터만 읽는다. GitHub/DB 토큰을 Worker에 추가하지 않는다.
export async function backupFreshness({ state, fetchFn = fetch, now = Date.now() }) {
  if (state && now - state.sampledAt < (state.status === 'backup_inspection_failed' ? 15 : 60) * 60_000) return state;
  const api = async route => {
    const response = await fetchFn(`https://api.github.com/repos/study734/jaemangho/${route}`, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'jaemangho-operations' } });
    if (!response.ok) throw new Error('metadata');
    return response.json();
  };
  try {
    const metadata = await api('actions/artifacts?per_page=100');
    const valid = async (prefix, workflow, age) => {
      const candidates = metadata.artifacts?.filter(a => new RegExp(`^${prefix}-[0-9]+$`).test(a.name) && !a.expired && a.workflow_run?.head_branch === 'main'
        && Number.isFinite(Date.parse(a.created_at)) && now - Date.parse(a.created_at) >= -5 * 60_000 && now - Date.parse(a.created_at) < age)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) ?? [];
      for (const artifact of candidates.slice(0, 3)) {
        if (!Number.isSafeInteger(artifact.workflow_run.id)) continue;
        const run = await api(`actions/runs/${artifact.workflow_run.id}`);
        if (run.path === `.github/workflows/${workflow}.yml` && run.head_branch === 'main' && run.head_repository?.full_name === 'study734/jaemangho'
          && ['schedule', 'workflow_dispatch'].includes(run.event) && run.conclusion === 'success') return true;
      }
      return false;
    };
    const backup = await valid('production-backup', 'production-backup', 36 * 3_600_000);
    const restore = await valid('restore-verification', 'production-restore-check', 8 * 86400_000);
    return { status: !backup ? 'backup_stale' : !restore ? 'restore_stale' : 'healthy', sampledAt: now };
  } catch { return { status: 'backup_inspection_failed', sampledAt: now }; }
}
