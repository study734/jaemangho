export function connectionEnv(url: string, original?: Record<string, string | undefined>): Record<string, string | undefined>;
export function sameDatabase(a: string, b: string): boolean;
export function createBackup(options: { url: string; file: string }): Promise<{ file: string; sha256: string }>;
export function verifyRestore(options: { sourceUrl: string; targetUrl: string; file: string; confirmIsolated: boolean }): Promise<Record<string, unknown>>;
