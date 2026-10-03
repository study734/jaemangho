// SQL 마이그레이션 실행기. migrations/NNNN_이름.sql 을 번호순으로 한 번씩 적용하고 schema_migrations에 기록한다.
// - 이미 적용된 파일이 바뀌었으면 실패한다 (적용된 마이그레이션은 수정하지 않고 새 파일을 추가한다).
// - 파일 하나는 하나의 트랜잭션: 실패하면 그 파일은 반영되지 않고 기록도 남지 않는다.
// - 여러 곳에서 동시에 실행돼도 어드바이저리 락으로 한 번만 적용된다.
// 사용: node scripts/migrate.mjs  (DATABASE_URL_UNPOOLED > DATABASE_URL > POSTGRES_URL)
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const LOCK_KEY = 727274;
const FILE_PATTERN = /^\d{4}_[\w-]+\.sql$/;

export async function migrate({ url, dir = DEFAULT_DIR, log = () => {} }) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // 동시에 처음 실행돼도 안전하도록 기록 테이블 생성도 락 안에서 한다
    // (create table if not exists 를 동시에 실행하면 Postgres가 간헐적으로 실패한다)
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);
    await client.query('commit');

    const files = (await readdir(dir)).filter((f) => FILE_PATTERN.test(f)).sort();
    const applied = new Map(
      (await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum])
    );

    const ran = [];
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          throw new Error(`이미 적용된 마이그레이션이 수정되었습니다: ${file}. 새 파일(다음 번호)로 변경을 추가하세요.`);
        }
        continue;
      }

      await client.query('begin');
      try {
        await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
        // 락을 기다리는 동안 다른 곳에서 먼저 적용했을 수 있다
        const done = await client.query('select 1 from schema_migrations where name = $1', [file]);
        if (done.rowCount === 0) {
          await client.query(sql);
          await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [file, checksum]);
          ran.push(file);
          log(`적용: ${file}`);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`${file} 적용 실패: ${error.message}`);
      }
    }
    log(ran.length ? `${ran.length}개 적용 완료` : '적용할 마이그레이션 없음');
    return ran;
  } finally {
    await client.end();
  }
}

// 명령줄로 실행했을 때
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.log('[migrate] DB 주소(DATABASE_URL)가 없어 마이그레이션을 건너뜁니다');
  } else {
    migrate({ url, log: (message) => console.log(`[migrate] ${message}`) }).catch((error) => {
      console.error(`[migrate] 실패: ${error.message}`);
      process.exit(1);
    });
  }
}
