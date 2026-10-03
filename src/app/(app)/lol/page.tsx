'use client';

import { Dashboard, useLol } from '@/features/lol';

export default function DashboardPage() {
  const { members, loadDetails } = useLol();
  return <Dashboard members={members} fetchMemberDetails={loadDetails} />;
}
