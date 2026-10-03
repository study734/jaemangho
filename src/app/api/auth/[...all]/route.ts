import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth';
import { db } from '@/server/db';

// /api/auth/* 는 모두 로그인 라이브러리가 처리한다 (디스코드 로그인 시작/콜백, 로그아웃, 세션 조회 등)
const handler = toNextJsHandler(auth);
const withSchema = (h: (req: Request) => Promise<Response>) => async (req: Request) => {
  await db(); // 첫 요청에서 테이블이 없으면 만든다
  return h(req);
};

export const GET = withSchema(handler.GET);
export const POST = withSchema(handler.POST);
