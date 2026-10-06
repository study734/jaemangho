export function monitor(options: {
  url: string; stateFile: string; secret?: string; webhook?: string; fetchFn?: typeof fetch;
}): Promise<{ status: string; notificationFailed: boolean }>;
