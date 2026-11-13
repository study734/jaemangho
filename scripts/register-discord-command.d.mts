type Command = { name: string; type?: number; description?: string; default_member_permissions?: string | null; options?: unknown[] };
export function normalizeCommand(command: Command): unknown;
export function changedCommands<T extends Command>(defined: T[], registered: Command[]): T[];
export function registerCommand(options?: {
  args?: string[];
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void>;
