import { redirect } from 'next/navigation';
import { getViewer } from '@/server/viewer';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ blocked?: string }> }) {
  const { blocked } = await searchParams;
  // 이미 로그인한 사용자는 앱으로 보낸다 (차단 안내 화면은 예외)
  if (!blocked && (await getViewer()).status === 'ok') redirect('/lol');

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: '#001e2b', color: '#fff' }}>
      <h1 className="heading-1">⚓ 재망호</h1>
      {blocked ? (
        <p className="subtitle">차단된 계정입니다. 관리자에게 문의해 주세요.</p>
      ) : (
        <>
          <p className="subtitle">크루 디스코드 서버 멤버만 접속할 수 있습니다.</p>
          <a className="btn btn-primary" href="/api/auth/login">디스코드로 로그인</a>
        </>
      )}
    </div>
  );
}
