export function probeSmoke(url: string, fetchFn?: typeof fetch): Promise<{ path: string; ok: boolean }[]>;
