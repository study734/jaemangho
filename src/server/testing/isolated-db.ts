import pg from 'pg';
import { migrate } from '../../../scripts/migrate.mjs';

// DB 통합 테스트를 파일 단위로 병렬 실행하기 위한 준비. vitest.config.ts의 db 프로젝트가 쓴다.
// - globalSetup: TEST_DATABASE_URL에 마이그레이션을 한 번 적용해 템플릿으로 만든다.
// - 파일별 setup: 템플릿을 복제한 전용 DB를 만들고 그 파일의 TEST_DATABASE_URL을 바꾼 뒤, 파일이 끝나면 지운다.
// 테스트 파일은 testing/db.ts의 testDbUrl만 쓰므로 이 과정을 모른다.

const PREFIX = 'jmh_t_';

const withDb = (url: string, db: string) => {
  const next = new URL(url);
  next.pathname = `/${db}`;
  return next.toString();
};

async function withAdmin<T>(baseUrl: string, run: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: withDb(baseUrl, 'postgres') });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

export async function prepareTemplate(baseUrl: string) {
  await migrate({ url: baseUrl });
  // 이전 실행이 중간에 멈춰 남긴 복제 DB를 지운다. 같은 테스트 DB 서버에서 vitest를 동시에 두 번 돌리지 않는다는 기존 전제를 따른다.
  await withAdmin(baseUrl, async (admin) => {
    const { rows } = await admin.query<{ datname: string }>('select datname from pg_database where datname like $1', [`${PREFIX}%`]);
    for (const { datname } of rows) await admin.query(`drop database if exists "${datname}" with (force)`);
  });
}

export async function cloneTemplate(baseUrl: string) {
  const template = new URL(baseUrl).pathname.slice(1);
  const name = `${PREFIX}${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await withAdmin(baseUrl, async (admin) => {
    // 템플릿에 다른 접속이 있으면 Postgres가 최대 5초 기다린 뒤 55006으로 거부한다(예: 같은 DB를 쓰는 E2E 서버).
    // 막 끊긴 접속일 수 있어 한 번만 다시 시도하고, 계속되면 원인을 알린다.
    for (let attempt = 1; ; attempt++) {
      try {
        await admin.query(`create database "${name}" template "${template}"`);
        return;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== '55006' || attempt >= 2) {
          throw new Error(`테스트 DB 복제 실패(${code ?? 'unknown'}): 템플릿 "${template}"에 다른 접속이 없는지 확인하세요`, { cause: error });
        }
      }
    }
  });
  return {
    url: withDb(baseUrl, name),
    drop: () => withAdmin(baseUrl, (admin) => admin.query(`drop database if exists "${name}" with (force)`)),
  };
}
