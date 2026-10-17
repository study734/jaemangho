import { Client } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { postgresUrl } from './postgres-url.mjs';

afterEach(() => vi.restoreAllMocks());

it.each(['prefer', 'require', 'verify-ca'])('pins the existing certificate verification for %s without emitting warnings', mode => {
  const warning = vi.spyOn(process, 'emitWarning');
  const input = `postgres://user:p%40ss@db.invalid:5432/test?sslmode=${mode}&application_name=jmh`;
  const output = postgresUrl(input)!;
  const parameters = Reflect.get(new Client({ connectionString: output }), 'connectionParameters') as { ssl: object; password: string };
  expect(parameters.ssl).toEqual({});
  expect(parameters.password).toBe('p@ss');
  expect(new URL(output).searchParams.get('application_name')).toBe('jmh');
  expect(warning).not.toHaveBeenCalled();
});

it.each([undefined, 'test', 'postgres://localhost/test',
  'postgres://localhost/test?sslmode=disable', 'postgres://localhost/test?sslmode=verify-full',
  'postgres://localhost/test?sslmode=no-verify', 'postgres://localhost/test?sslmode=require&uselibpqcompat=true',
  'postgres://localhost/test?sslmode=require&sslmode=disable',
  'postgres://localhost/test?sslmode=disable&sslmode=require',
  'postgres://localhost/test?sslmode=require&uselibpqcompat=true&uselibpqcompat=false'])('preserves explicit or non-legacy configuration: %s', input => {
  expect(postgresUrl(input)).toBe(input);
});
