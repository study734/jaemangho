export function monitor(options: {
  url: string; stateFile: string; secret?: string; webhook?: string; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>;
}): Promise<{ status: string; notificationFailed: boolean }>;
