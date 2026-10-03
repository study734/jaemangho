'use client';

import { rosterApi, useLol } from '@/features/lol';
import { AdminDashboard } from '@/components/AdminDashboard';

export function AdminScreen() {
  const { forgetMember } = useLol();
  return (
    <AdminDashboard
      onDeleteMember={async (id) => {
        await rosterApi.remove(id);
        forgetMember(id);
      }}
    />
  );
}
