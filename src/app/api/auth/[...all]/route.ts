import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth';

// /api/auth/* 는 모두 로그인 라이브러리가 처리한다 (디스코드 로그인 시작/콜백, 로그아웃, 세션 조회 등)
export const { GET, POST } = toNextJsHandler(auth);
