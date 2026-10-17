import { requireUser } from '@/server/viewer';
import { aiDisabledResponse } from '@/server/ai-status';

// A tombstone for older tabs/clients. Authentication still runs before the
// suspension response; request bodies and external providers are never read.
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return aiDisabledResponse();
}
