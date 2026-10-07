import { redirect } from 'next/navigation';
import { getViewer } from '@/server/viewer';
import { LoginButton } from './login-button';

// 로그인 라이브러리가 돌려주는 오류 코드를 사용자에게 보여줄 문구로 바꾼다
function messageFor(error: string) {
  if (error === 'unable_to_get_user_info') return '접속할 수 없습니다. 재망호 디스코드 서버 멤버가 아니거나 차단된 계정입니다.';
  if (/banned/i.test(error)) return '차단된 계정입니다. 관리자에게 문의해 주세요.';
  return '로그인하지 못했습니다. 서버 멤버가 아니거나 차단된 계정일 수 있습니다. 잠시 후 다시 시도해 주세요.';
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // 이미 로그인한 사용자는 앱으로 보낸다 (오류 안내 화면은 예외)
  if (!error && (await getViewer()).status === 'ok') redirect('/');

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: 'var(--canvas-dark)', color: 'var(--ink)' }}>
      <h1 className="heading-1" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src="/favicon.svg" width="48" height="48" alt="" aria-hidden="true" />
        재망호
      </h1>
      <p className="subtitle">{error ? messageFor(error) : '크루 디스코드 서버 멤버만 접속할 수 있습니다.'}</p>
      {error && <p style={{ color: 'var(--steel)', fontSize: 12 }}>오류 코드: {error}</p>}
      <LoginButton />
    </div>
  );
}
