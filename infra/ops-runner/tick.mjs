import { backupFreshness } from './backups.mjs';
const SITE = 'https://jaemangho.vercel.app';
const instructions = {
  configuration: '설정 누락·인증 오류. 조치: Worker의 CRON_SECRET·운영 webhook 설정을 확인하세요.',
  unavailable: '사이트 또는 DB 응답 실패가 10분 이상 지속됩니다. 조치: Vercel 배포·DB 상태를 확인하세요.',
  execution: '크론 점검·복구 요청 실패가 10분 이상 지속됩니다. 조치: Worker 및 앱 실행 기록을 확인하세요.',
  backup_stale: '36시간 이내 검증된 운영 백업이 없습니다. 조치: Production encrypted backup의 실행·Secrets·활성화 설정을 확인하세요.',
  restore_stale: '8일 이내 보관 백업 복원 검증 성공이 없습니다. 조치: Stored backup restore verification의 실패 단계를 확인하세요.',
  backup_inspection_failed: 'GitHub 백업 메타데이터를 확인하지 못했습니다. 조치: API 제한·저장소 공개 여부를 확인하세요. 백업 실패로 단정하지 않습니다.',
};
const allowedWebhook = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && ['discord.com', 'discordapp.com'].includes(u.hostname) && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/api\/webhooks\/\d{17,20}\/[\w-]+$/.test(u.pathname); }
  catch { return false; }
};
export async function tick({ state = {}, secret, webhook, fetchFn = fetch, now = Date.now(), backupEnabled = false }) {
  const request = async (path, timeout, auth = true) => {
    const response = await fetchFn(new URL(path, SITE), { redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { 'Cache-Control': 'no-cache', ...(auth ? { Authorization: `Bearer ${secret}` } : {}) } });
    if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'configuration' : 'execution');
    return response.json();
  };
  let status = secret ? 'healthy' : 'configuration';
  let recovery = 'not_started';
  if (secret) {
    try {
      if ((await request('/api/health', 15_000, false)).ok !== true) status = 'unavailable';
    } catch { status = 'unavailable'; }
    if (status === 'healthy') {
      try {
        recovery = (await request('/api/cron/recovery', 65_000)).recovery;
        if (!['success', 'partial', 'failed', 'waiting', 'running', 'busy', 'manual_required', 'exhausted', 'not_needed'].includes(recovery)) throw new Error('execution');
      } catch (error) { status = error?.message === 'configuration' ? 'configuration' : 'execution'; }
      // 복구 요청 실패와 무관하게 점검한다. 앱이 필요한 개입만 알린다.
      try {
        const checked = await request('/api/cron/ops', 60_000);
        if (checked.skipped !== false || !Number.isInteger(checked.active) || checked.active < 0) throw new Error('execution');
      } catch (error) { status = error?.message === 'configuration' ? 'configuration' : 'execution'; }
    }
  }
  const backups = backupEnabled ? await backupFreshness({ state: state.backups, fetchFn, now }) : undefined;
  if (status === 'healthy' && backups?.status !== undefined && backups.status !== 'healthy') status = backups.status;
  if (!webhook || !allowedWebhook(webhook)) status = 'configuration';
  const since = state.status === status ? (state.since ?? now) : now;
  const actionable = status === 'configuration' || status !== 'healthy' && now - since >= 10 * 60_000;
  let notified = state.notified ?? 'healthy';
  let notificationFailed = actionable && !webhook;
  if ((actionable || status === 'healthy' && notified !== 'healthy') && notified !== status && webhook) {
    try {
      if (!allowedWebhook(webhook)) throw new Error('webhook');
      const message = status === 'healthy' ? '[재망호 복구] 독립 감시·복구 실행이 정상화되었습니다. 개별 장애는 운영 상태에서 확인하세요.'
        : `[재망호 개입 필요] ${status}: ${instructions[status]} 영향: 자동 운영 보호가 완료되지 않았습니다. 자동 처리: 반복 확인 완료. https://github.com/study734/jaemangho/actions`;
      const response = await fetchFn(webhook, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }) });
      if (!response.ok) throw new Error('delivery');
      notified = status;
    } catch { notificationFailed = true; }
  }
  return { status, since, notified, recovery, checkedAt: now, notificationFailed, ...(backups ? { backups } : {}) };
}
