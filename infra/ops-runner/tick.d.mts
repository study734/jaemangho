export interface State { status?: string; since?: number; notified?: string; recovery?: string; backups?: { status: string; sampledAt: number }; checkedAt?: number; notificationFailed?: boolean }
export function tick(options: { state?: State; backupEnabled?: boolean; secret?: string; webhook?: string; fetchFn?: typeof fetch; now?: number }): Promise<State>;
