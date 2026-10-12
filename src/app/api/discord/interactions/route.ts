import { after } from 'next/server';
import { receiveInteraction } from '@/server/discord-interactions/handler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  return receiveInteraction(request, work => after(work));
}
