import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/session';

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
