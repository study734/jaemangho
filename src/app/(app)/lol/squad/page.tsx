'use client';

import { SquadManager, useLol } from '@/features/lol';

export default function SquadPage() {
  const { members, addMember, removeMember, updateMember, searchSummoner } = useLol();
  return (
    <SquadManager
      members={members}
      onAddMember={addMember}
      onRemoveMember={removeMember}
      onUpdateMember={updateMember}
      onSearchMember={searchSummoner}
    />
  );
}
