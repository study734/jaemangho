export const PROJECT: string;
export const TEAM: string;
export function schemaCompatible(a: string, b: string): boolean;
export interface ReleaseState { good?: { id: string; sha: string; checkedAt?: number }; attempted?: { id: string; previousId: string; at: number } }
export function guardDeployment(options: { token?: string; state?: ReleaseState; persist?: (state: ReleaseState) => Promise<void>; fetchFn?: typeof fetch;
  probe?: (url: string, fetchFn?: typeof fetch) => Promise<{ path?: string; ok: boolean }[]>;
  compatible?: (a: string, b: string) => boolean; sleep?: (ms: number) => Promise<void>; rollbackEnabled?: boolean }): Promise<{ status: string; reason?: string; deploymentId?: string; failedDeploymentId?: string }>;
