import { redirect } from 'next/navigation';
import { getViewer } from '@/server/viewer';
import { AdminScreen } from './screen';

export default async function AdminPage() {
  const result = await getViewer();
  if (result.status !== 'ok' || !result.viewer.isAdmin) redirect('/lol');
  return <AdminScreen />;
}
