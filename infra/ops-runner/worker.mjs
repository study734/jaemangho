import { tick } from './tick.mjs';

// Workers Logs에 남기는 실행 요약. 비밀값·웹훅 주소가 섞이지 않도록 허용한 필드만 고른다.
export const runSummary = state => ({
  event: 'ops-runner.tick', status: state.status, since: state.since, notified: state.notified,
  operations: state.operations?.status, recovery: state.recovery, backups: state.backups?.status,
  notificationFailed: !!state.notificationFailed,
});

// 사람이 볼 일이 있을 때만 true: 알림을 보낸 장애가 이어지는 중이거나(notified가 healthy가 아님) 알림 전송이 실패했을 때.
// 10분 미만의 일시 장애는 tick이 알림을 보내지 않으므로 경고 요약(console.warn)만 남기고 Workers 실행 실패로 만들지 않는다.
export const needsAttention = state => state.notified !== 'healthy' || !!state.notificationFailed;

export class OperationsRunner {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch() {
    const claimed = await this.ctx.storage.transaction(async storage => {
      if ((await storage.get('lease') ?? 0) > Date.now()) return false;
      await storage.put('lease', Date.now() + 4 * 60_000);
      return true;
    });
    if (!claimed) return new Response('busy', { status: 409 });
    try {
      const state = await tick({ state: await this.ctx.storage.get('state'), secret: this.env.CRON_SECRET, webhook: this.env.OPS_ALERT_WEBHOOK_URL, backupEnabled: this.env.OPS_BACKUP_ENABLED === '1' });
      await this.ctx.storage.put('state', state);
      (state.status === 'healthy' ? console.log : console.warn)(JSON.stringify(runSummary(state)));
      return Response.json({ status: state.status, notificationFailed: state.notificationFailed, attention: needsAttention(state) });
    } finally { await this.ctx.storage.delete('lease'); }
  }
}
export default {
  async scheduled(_event, env) {
    const stub = env.RUNNER.get(env.RUNNER.idFromName('jaemangho-operations'));
    const response = await stub.fetch('https://runner.internal/run', { method: 'POST' });
    if (!response.ok && response.status !== 409) throw new Error('Independent runner failed');
    if (response.ok) {
      const result = await response.json();
      if (result.attention) throw new Error(`Independent runner requires attention: ${result.status}; notificationFailed=${!!result.notificationFailed}`);
    }
  },
  fetch() { return new Response('Not found', { status: 404 }); },
};
