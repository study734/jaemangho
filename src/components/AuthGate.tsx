import { useEffect, useState, type ReactNode } from 'react';
import { MeContext, type Me } from '../auth';

// 배포 환경에서는 디스코드 로그인(세션 쿠키)이 있어야 앱을 보여준다. 로컬 개발은 통과.
const DEV = import.meta.env.DEV;

type State = { status: 'loading' | 'out' | 'blocked' } | { status: 'in'; me: Me | null };

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(DEV ? { status: 'in', me: null } : { status: 'loading' });

  useEffect(() => {
    if (DEV) return;
    fetch('/api/auth/me')
      .then(async (r) => {
        if (r.ok) setState({ status: 'in', me: await r.json() });
        else setState({ status: r.status === 403 ? 'blocked' : 'out' });
      })
      .catch(() => setState({ status: 'out' }));
  }, []);

  if (state.status === 'in') return <MeContext.Provider value={state.me}>{children}</MeContext.Provider>;
  if (state.status === 'loading') return null;

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: '#001e2b', color: '#fff' }}>
      <h1 className="heading-1">⚓ 재망호</h1>
      {state.status === 'blocked' ? (
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
