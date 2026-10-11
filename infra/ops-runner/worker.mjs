import { tick } from './tick.mjs';

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
      return Response.json({ status: state.status, notificationFailed: state.notificationFailed });
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
      if (result.status !== 'healthy' || result.notificationFailed) throw new Error(`Independent runner requires attention: ${result.status}; notificationFailed=${!!result.notificationFailed}`);
    }
  },
  fetch() { return new Response('Not found', { status: 404 }); },
};
