import { createHmac } from 'node:crypto';
import pg from 'pg';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E_DATABASE_URL, E2E_ENV } from './env';

// 이 테스트가 만든 데이터는 모두 e2e_ 접두사를 가진다 (정리할 때 이것만 지운다)
// 테스트 파일들이 같은 연결 풀을 공유한다. 파일마다 닫지 않고, 유휴 연결이 빨리 닫히게 해서 워커가 정상 종료되게 한다.
export const db = new pg.Pool({ connectionString: E2E_DATABASE_URL, max: 2, idleTimeoutMillis: 1000 });

export async function cleanup() {
  await db.query(`delete from members where id like 'e2e_%' or created_by like 'e2e_%'`);
  await db.query(`delete from "user" where id like 'e2e_%'`); // session/account는 cascade
}

// 세션 쿠키: 로그인 라이브러리가 서명하는 방식(HMAC-SHA256, base64)과 같다.
// 기준 주소가 http 이면 Secure 쿠키가 아니고 이름에 __Secure- 접두사도 붙지 않는다 (https 운영에서는 붙는다).
const signedCookie = (token: string) =>
  encodeURIComponent(`${token}.${createHmac('sha256', E2E_ENV.SESSION_SECRET).update(token).digest('base64')}`);

export const SESSION_COOKIE = 'jmh.session_token';

export interface TestUser {
  id: string;
  name: string;
  token: string;
}

export async function createUser(key: string, name: string, role: 'admin' | 'user' = 'user'): Promise<TestUser> {
  const id = `e2e_${key}`;
  const token = `e2e_tok_${key}`;
  await db.query(
    `insert into "user" (id, name, email, "emailVerified", role, username, "loginCount", "lastLoginAt", "createdAt", "updatedAt")
     values ($1, $2, $3, false, $4, $5, 1, now(), now(), now())`,
    [id, name, `${id}@e2e.invalid`, role, key]
  );
  await db.query(
    `insert into session (id, token, "userId", "expiresAt", "createdAt", "updatedAt") values ($1, $2, $3, now() + interval '1 day', now(), now())`,
    [`${id}_s`, token, id]
  );
  return { id, name, token };
}

export async function loginAs(context: BrowserContext, user: TestUser) {
  await context.addCookies([
    { name: SESSION_COOKIE, value: signedCookie(user.token), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

// Riot은 외부 서비스라 브라우저의 /api/riot 요청을 가짜 응답으로 대신한다 (서버 프록시는 시험 범위 밖: 단위 테스트가 다룬다)
export async function mockRiot(page: Page, summoner = { gameName: 'E2E소환사', tagLine: 'KR1' }) {
  await page.route(/\/api\/riot\?/, async (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? '';
    if (path.startsWith('/riot/account/')) return route.fulfill({ json: { puuid: 'E2EPUUID', ...summoner } });
    if (path.includes('/summoners/by-puuid/')) return route.fulfill({ json: { id: 'S1', summonerLevel: 321, profileIconId: 5 } });
    if (path.includes('/entries/by-puuid/'))
      return route.fulfill({ json: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 55, wins: 10, losses: 8 }] });
    return route.fulfill({ status: 404, json: {} });
  });
}

// 브라우저 안에서 fetch한 응답 상태. 로그인한 사용자의 요청은 쿠키가 담긴 브라우저를 통해 시험한다.
export async function statusOf(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(
    async ([p, method, body]) =>
      (await fetch(p as string, { method: method as string, headers: { 'Content-Type': 'application/json' }, body: body as string | undefined })).status,
    [path, init?.method ?? 'GET', init?.body ? JSON.stringify(init.body) : undefined] as const
  );
}

export const test = base.extend({});
export { expect };
