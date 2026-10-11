import { backupFreshness } from './backups.mjs';
import { requestJson } from './request.mjs';
const SITE = 'https://jaemangho.vercel.app';
const DOMAIN = 'https://www.jaemangho.shop';
const DB_INTERVAL = 30 * 60_000;
const instructions = {
  configuration: '설정 누락·인증 오류. 조치: Worker의 CRON_SECRET·운영 webhook 설정을 확인하세요.',
  unavailable: '앱 실행 응답 실패가 10분 이상 지속됩니다. 조치: Vercel 배포 상태를 확인하세요.',
  domain_unavailable: '사용자 도메인 응답 실패가 10분 이상 지속됩니다. 조치: DNS·TLS·Vercel 도메인 연결을 확인하세요. 기본 Vercel 주소와 분리해 점검했습니다.',
  database_unavailable: 'DB 헬스 응답 실패가 재확인에서도 지속됩니다. 조치: Neon 연산 한도·접속·DB 상태를 확인하세요.',
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
  const request = (path, timeout, auth = true, base = SITE) => requestJson(fetchFn, new URL(path, base), timeout,
    { 'Cache-Control': 'no-cache', ...(auth ? { Authorization: `Bearer ${secret}` } : {}) });
  const live = async base => {
    try { const result = await request('/api/health/live', 15_000, false, base); return result.ok === true && result.kind === 'liveness'; }
    catch { return false; }
  };
  // 사용자 도메인에는 Secret을 보내지 않는다. 두 실행 상태 점검 모두 DB를 깨우지 않는다.
  const [siteUp, domainUp] = await Promise.all([live(SITE), live(DOMAIN)]);
  let operations = state.operations ?? { status: 'healthy', recovery: 'not_started' };
  const last = operations.checkedAt;
  const due = !Number.isFinite(last) || now < last || Math.floor(now / DB_INTERVAL) > Math.floor(last / DB_INTERVAL)
    || operations.status !== 'healthy';
  if (siteUp && secret && due) {
    let status = 'healthy';
    let recovery = 'not_started';
    try { if ((await request('/api/health', 15_000, false)).ok !== true) status = 'database_unavailable'; }
    catch { status = 'database_unavailable'; }
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
    operations = { status, recovery, checkedAt: now };
  }
  let status = !secret ? 'configuration' : !siteUp ? 'unavailable' : !domainUp ? 'domain_unavailable' : operations.status;
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        response = await fetchFn(webhook, { method: 'POST', redirect: 'manual', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }) });
        if (!response.ok) throw new Error('delivery');
      } finally { clearTimeout(timer); await response?.body?.cancel().catch(() => {}); }
      notified = status;
    } catch { notificationFailed = true; }
  }
  return { status, since, notified, recovery: operations.recovery, operations, checkedAt: now, notificationFailed, ...(backups ? { backups } : {}) };
}
