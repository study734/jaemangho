export function registerCommand(options?: {
  args?: string[];
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
}): Promise<void>;
