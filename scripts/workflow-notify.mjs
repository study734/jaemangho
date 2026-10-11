import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
export async function notifyWorkflow({ kind, status, webhook, runId, stateFile, fetchFn = fetch }) {
  if (!['release', 'backup', 'restore', 'usage'].includes(kind)) throw new Error('Unknown operations job');
  const file = stateFile ?? `.ops-automation/${kind}.json`;
  let previous;
  try { previous = JSON.parse(await readFile(file, 'utf8')).status; } catch { /* 첫 실행 */ }
  if (!['healthy', 'failed'].includes(status)) throw new Error('Unknown operations result');
  if (previous !== status && (status === 'failed' || previous === 'failed')) {
    let url;
    try { url = new URL(webhook); } catch { throw new Error('Operations notification not configured'); }
    if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/api\/webhooks\/\d{17,20}\/[\w-]+$/.test(url.pathname)) throw new Error('Invalid operations webhook');
    const labels = { release: '배포 검증·안전 롤백', backup: '암호화 운영 백업', restore: '보관 백업 복원 검증', usage: '무료 사용량 점검' };
    const link = /^\d+$/.test(runId ?? '') ? `https://github.com/study734/jaemangho/actions/runs/${runId}` : 'GitHub Actions';
    const content = status === 'failed' ? `[재망호 개입 필요] ${labels[kind]} 실패. 영향: 운영 보호가 완료되지 않았습니다. 자동 처리: 안전 조건을 확인한 뒤 중단했습니다. 조치: 실패 단계·Secrets를 확인하세요. ${link}` : `[재망호 복구] ${labels[kind]} 정상화. ${link}`;
    const response = await fetchFn(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
    if (!response.ok) throw new Error('Operations notification delivery failed');
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ status, checkedAt: Date.now() }), { mode: 0o600 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  notifyWorkflow({ kind: process.env.OPS_JOB, status: process.env.OPS_RESULT === 'success' ? 'healthy' : 'failed', webhook: process.env.OPS_ALERT_WEBHOOK_URL, runId: process.env.GITHUB_RUN_ID }).catch(() => {
    console.error('[operations] notification failed; state retained for retry'); process.exitCode = 1;
  });
}
