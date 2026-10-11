import { appendFile } from 'node:fs/promises';
// 저장소의 성공한 main 운영 백업만 선택한다. PR 아티팩트는 선택하지 않는다.
const api = async route => {
  const response = await fetch(`https://api.github.com/repos/study734/jaemangho/${route}`, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Backup metadata unavailable');
  return response.json();
};
const runs = await api('actions/workflows/production-backup.yml/runs?branch=main&status=success&per_page=30');
let selected;
for (const run of runs.workflow_runs ?? []) {
  if (run.head_branch !== 'main' || !['schedule', 'workflow_dispatch'].includes(run.event) || run.conclusion !== 'success') continue;
  const artifacts = await api(`actions/runs/${run.id}/artifacts`);
  const artifact = artifacts.artifacts?.find(a => a.name === `production-backup-${run.id}` && !a.expired);
  if (artifact && Date.now() - Date.parse(artifact.created_at) < 7 * 86400_000) { selected = { runId: run.id, artifactId: artifact.id }; break; }
}
if (!selected || ![selected.runId, selected.artifactId].every(Number.isSafeInteger)) throw new Error('Recent verified production backup missing');
await appendFile(process.env.GITHUB_OUTPUT, `run_id=${selected.runId}\nartifact_id=${selected.artifactId}\n`);
console.log('[backup] recent verified main artifact selected');
