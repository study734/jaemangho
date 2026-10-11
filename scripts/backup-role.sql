-- psql -X용. 운영 권한 변경이므로 운영자 승인 후 테이블 소유자의 연결로 실행한다.
-- APP_OWNER는 현재/향후 앱 마이그레이션을 실행하는 DB 역할 이름이다.
-- 비밀번호는 마지막 \password 프롬프트에서 입력하며 SQL/명령 인수에 넣지 않는다.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE jaemangho_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE jaemangho_backup SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE :"DBNAME" TO jaemangho_backup;
GRANT USAGE ON SCHEMA public TO jaemangho_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO jaemangho_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO jaemangho_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE :"APP_OWNER" IN SCHEMA public GRANT SELECT ON TABLES TO jaemangho_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE :"APP_OWNER" IN SCHEMA public GRANT SELECT ON SEQUENCES TO jaemangho_backup;
COMMIT;
\password jaemangho_backup
