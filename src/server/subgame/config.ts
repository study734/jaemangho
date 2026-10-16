import { z } from 'zod';

export class SubgameConfigError extends Error {}

// SUBGAME_THREADS: {"붕괴: 스타레일": "<포럼 스레드 ID>", ...}. 게임 이름은 사이트에 표시되는 그대로.
const threadsSchema = z.record(z.string().min(1), z.string().regex(/^\d{17,20}$/, '숫자 ID(17~20자리)여야 합니다'));
export function parseThreads(raw: string | undefined): Record<string, string> | null {
  if (!raw?.trim()) return null;
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new SubgameConfigError('SUBGAME_THREADS: JSON 형식이 아닙니다'); }
  const parsed = threadsSchema.safeParse(json);
  if (!parsed.success) throw new SubgameConfigError(`SUBGAME_THREADS: ${parsed.error.issues[0].message}`);
  return parsed.data;
}
