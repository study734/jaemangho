import { getViewer } from '@/server/viewer';
import type { Notice } from '@/lib/game-notice';
import { listNotices } from '@/server/game-notices';
import { GameNotices } from '@/components/GameNotices';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const viewer = await getViewer();
  if (viewer.status !== 'ok') return null;
  let notices: Notice[] | null = null;
  try { notices = await listNotices(); } catch { /* 빈 목록과 구분해 오류 문구를 보여준다 */ }
  return <GameNotices notices={notices} viewerId={viewer.viewer.id} isAdmin={viewer.viewer.isAdmin} />;
}
