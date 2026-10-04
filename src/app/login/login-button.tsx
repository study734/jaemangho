'use client';

import { authClient } from '@/lib/auth-client';

export function LoginButton() {
  return (
    <button
      className="btn btn-primary"
      onClick={() => authClient.signIn.social({ provider: 'discord', callbackURL: '/', errorCallbackURL: '/login' })}
    >
      디스코드로 로그인
    </button>
  );
}
