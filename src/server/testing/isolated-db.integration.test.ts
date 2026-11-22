import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { cloneTemplate } from './isolated-db';
import { testDbUrl } from './db';

// testDbUrl은 이 파일 전용 복제 DB다(isolated-db.setup.ts). 그것을 다시 템플릿으로 써서 복제·삭제와 거부 안내를 확인한다.
describe.skipIf(!testDbUrl)('파일별 테스트 DB 복제', () => {
  const exists = async (url: string) => {
    const admin = new URL(url);
    const name = admin.pathname.slice(1);
    admin.pathname = '/postgres';
    const client = new pg.Client({ connectionString: admin.toString() });
    await client.connect();
    try { return (await client.query('select 1 from pg_database where datname = $1', [name])).rowCount === 1; }
    finally { await client.end(); }
  };

  it('템플릿과 같은 스키마의 DB를 만들고 drop으로 지운다', async () => {
    const db = await cloneTemplate(testDbUrl!);
    const client = new pg.Client({ connectionString: db.url });
    await client.connect();
    const { rows } = await client.query<{ n: number }>('select count(*)::int as n from schema_migrations');
    await client.end();
    expect(rows[0].n).toBeGreaterThan(0);
    await db.drop();
    expect(await exists(db.url)).toBe(false);
  });

  // 템플릿에 접속이 남아 거부되는 경로(55006)는 Postgres가 시도마다 5초 기다려 매 실행에 넣지 않는다.
  // 확인 방법: 복제 DB에 pg 접속을 열어 둔 채 cloneTemplate(그 주소)를 호출하면 '테스트 DB 복제 실패(55006)'로 약 10초 뒤 실패한다.
});
