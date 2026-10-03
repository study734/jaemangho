'use client';

import { SynergyAnalyzer, useLol } from '@/features/lol';

export default function SynergyPage() {
  return <SynergyAnalyzer members={useLol().members} />;
}
