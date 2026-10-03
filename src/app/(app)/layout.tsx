import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { LolProvider } from '@/features/lol';
import { getViewer } from '@/server/viewer';
import { Frame } from './frame';

// 로그인하지 않았거나 차단된 사용자는 앱 화면에 들어올 수 없다
export default async function AppLayout({ children }: { children: ReactNode }) {
  const result = await getViewer();
  if (result.status === 'blocked') redirect('/login?blocked=1');
  if (result.status !== 'ok') redirect('/login');

  return (
    <LolProvider>
      <Frame isAdmin={result.viewer.isAdmin}>{children}</Frame>
    </LolProvider>
  );
}
