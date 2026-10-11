import { createHmac } from 'node:crypto';
import { rm } from 'node:fs/promises';
import pg from 'pg';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E_DATABASE_URL, E2E_ENV } from './env';

// 이 테스트가 만든 데이터는 모두 e2e_ 접두사를 가진다 (정리할 때 이것만 지운다)
// 테스트 파일들이 같은 연결 풀을 공유한다. 파일마다 닫지 않고, 유휴 연결이 빨리 닫히게 해서 워커가 정상 종료되게 한다.
export const db = new pg.Pool({ connectionString: E2E_DATABASE_URL, max: 2, idleTimeoutMillis: 1000 });

export async function cleanup() {
  await db.query(`delete from chat_messages where id like 'e2e_%'`);
  await db.query(`delete from chat_highlights where id like 'e2e_%'`);
  await db.query(`delete from chat_awards where author_id like 'e2e_%'`);
  await db.query(`delete from ops_audit where actor_id like 'e2e_%'`);
  await db.query(`delete from members where id like 'e2e_%' or created_by like 'e2e_%'`);
  await db.query(`delete from "user" where id like 'e2e_%'`); // session/account는 cascade
  // 실제 TTL은 유지한다. 다른 테스트가 만든 데이터를 TTL 만료까지 기다리지 않게 한다.
  // E2E 빌드는 메모리 캐시를 사용하지 않으므로 파일 정리만으로 다음 요청이 새 데이터를 읽는다.
  await rm('.next/cache/fetch-cache', { recursive: true, force: true });
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

// 발견 화면과 실제 TTL 검증이 같은 네 가지 출처를 준비한다. 테스트마다 cleanup 후 호출한다.
export async function seedDiscovery(user: TestUser) {
  await db.query(`update "user" set image = '/brands/discord.svg' where id = $1`, [user.id]);
  await db.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
    values ('e2e_discovery_account', 'e2e_discovery_author_0', 'discord', $1, now(), now())`, [user.id]);
  await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
    select 'e2e_discovery_current_' || lpad(n::text, 2, '0'), 'e2e_discovery_channel', 'e2e_discovery_author_' || n % 4,
    case when n % 4 = 0 then '발견 친구' else '항해 친구 ' || n % 4 end,
    date_trunc('hour', now()) - interval '1 hour' + n * interval '1 second', 0 from generate_series(0, 39) n`);
  await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
    select 'e2e_discovery_baseline_' || b || '_' || n, 'e2e_discovery_channel', 'e2e_discovery_author_' || n % 4, '항해 친구',
    date_trunc('hour', now()) - interval '1 hour' - b * interval '1 day' + n * interval '1 second', 0
    from generate_series(1, 6) b cross join generate_series(0, 11) n`);
  await db.query(`insert into chat_highlights (id, channel_id, author_id, author_name, created_at, reactions, replies)
    values ('e2e_discovery_highlight', 'e2e_discovery_channel', 'e2e_discovery_author_0', '발견 친구', now() - interval '2 hours', 5, 3)`);
  await db.query(`insert into chat_awards (week_start, title, author_id, author_name, value)
    values ((date_trunc('week', now() at time zone 'Asia/Seoul') - interval '7 days')::date, 'owl', 'e2e_discovery_author_0', '발견 친구', 12)`);
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
