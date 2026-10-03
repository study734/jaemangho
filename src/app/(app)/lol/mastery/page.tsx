'use client';

import { MasteryShowcase, useLol } from '@/features/lol';

export default function MasteryPage() {
  return <MasteryShowcase members={useLol().members} />;
}
