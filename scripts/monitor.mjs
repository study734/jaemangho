import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function webhookAllowed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['discord.com', 'discordapp.com'].includes(url.hostname) && !url.port && !url.username && !url.password &&
      /^\/api\/webhooks\/\d{17,20}\/[\w-]+$/.test(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
}

// 앱과 DB가 완전히 내려가도 독립 실행되는 외부 감시. 같은 장애의 반복 알림은 상태 파일로 억제한다.
export async function monitor({ url, stateFile, secret, webhook, fetchFn = fetch }) {
  const base = new URL(url);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid monitoring URL');
  let state = { notified: 'healthy' };
  try { state = { ...state, ...JSON.parse(await readFile(stateFile, 'utf8')) }; } catch { /* 첫 실행 */ }
  let status = 'healthy';
  try {
    const response = await fetchFn(new URL('/api/health', base), { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) status = 'unavailable';
    else {
      if (!secret) status = 'monitor_unconfigured';
      else {
        const checked = await fetchFn(new URL('/api/cron/ops', base), {
          headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(60_000),
        });
        if (!checked.ok) status = 'monitor_failed';
        else {
          const result = await checked.json();
          if (result.skipped !== false || !Number.isInteger(result.active) || result.active < 0) status = 'monitor_failed';
        }
      }
    }
  } catch { status = 'unavailable'; }
  let notificationFailed = false;
  if (webhook && state.notified !== status) {
    try {
      if (!webhookAllowed(webhook)) throw new Error('Invalid webhook');
      const message = status === 'healthy' ? '[재망호 복구] 사이트와 운영 점검이 정상입니다.' :
        status === 'unavailable' ? '[재망호 긴급] 사이트 또는 DB 헬스체크에 실패했습니다.' : '[재망호 운영 알림] 자동 점검의 설정 또는 실행에 문제가 있습니다.';
      const delivery = await fetchFn(webhook, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
      });
      if (!delivery.ok) throw new Error('Delivery failed');
      state.notified = status;
    } catch { notificationFailed = true; }
  }
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify({ ...state, status, checkedAt: new Date().toISOString() }), { mode: 0o600 });
  return { status, notificationFailed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2];
  const stateFile = process.argv[3] ?? '.ops-monitor/state.json';
  if (!url) { console.error('Usage: node scripts/monitor.mjs <site-url> [state-file]'); process.exitCode = 1; }
  else {
    monitor({ url, stateFile, secret: process.env.CRON_SECRET, webhook: process.env.OPS_ALERT_WEBHOOK_URL }).then((r) => {
      console.log(`[monitor] ${r.status}${r.notificationFailed ? '; notification delivery failed' : ''}`);
      if (r.status !== 'healthy' || r.notificationFailed) process.exitCode = 1;
    }).catch(() => { console.error('[monitor] state or configuration failed'); process.exitCode = 1; });
  }
}
