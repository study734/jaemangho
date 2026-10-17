import { requireUser } from '@/server/viewer';
import { aiDisabledResponse } from '@/server/ai-status';

async function disabledSettings() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return aiDisabledResponse();
}

export const GET = disabledSettings;
export const PUT = disabledSettings;
