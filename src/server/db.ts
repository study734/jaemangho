import { pool } from './pool';

// neon의 sql`...` 태그와 같은 모양으로 쓰는 파라미터 쿼리: sql`select * from t where id = ${id}` -> 행 배열
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

const sql: Sql = async (strings, ...values) => {
  const text = strings.reduce((acc, part, i) => `${acc}$${i}${part}`);
  return (await pool.query(text, values)).rows;
};

// 스키마는 여기서 만들지 않는다: migrations/*.sql 을 scripts/migrate.mjs 가 배포 때(빌드 전에) 적용한다.
export async function db(): Promise<Sql> {
  return sql;
}
