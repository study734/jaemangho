'use client';

import { authClient } from '@/lib/auth-client';

// callbackURL: 로그인 뒤 돌아올 이 사이트의 경로(예: 디스코드 게임추천 준비 화면 /connect/steam). 기본은 홈.
export function LoginButton({ callbackURL = '/' }: { callbackURL?: `/${string}` }) {
  return (
    <button
      className="btn btn-primary"
      onClick={() => authClient.signIn.social({ provider: 'discord', callbackURL, errorCallbackURL: '/login' })}
    >
      디스코드로 로그인
    </button>
  );
}
