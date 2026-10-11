export function recover(options: { url: string; secret?: string; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> }): Promise<{ recovery: string; verified: boolean }>;
