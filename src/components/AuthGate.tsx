import { useEffect, useState, type ReactNode } from 'react';

// 배포 환경에서는 디스코드 로그인(세션 쿠키)이 있어야 앱을 보여준다. 로컬 개발은 통과.
const DEV = import.meta.env.DEV;

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'in' | 'out'>(DEV ? 'in' : 'loading');

  useEffect(() => {
    if (DEV) return;
    fetch('/api/auth/me')
      .then((r) => setState(r.ok ? 'in' : 'out'))
      .catch(() => setState('out'));
  }, []);

  if (state === 'in') return children;
  if (state === 'loading') return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: '#001e2b', color: '#fff' }}>
      <h1 className="heading-1">⚓ 재망호</h1>
      <p className="subtitle">크루 디스코드 서버 멤버만 접속할 수 있습니다.</p>
      <a className="btn btn-primary" href="/api/auth/login">디스코드로 로그인</a>
    </div>
  );
}
