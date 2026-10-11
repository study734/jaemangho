"""Register operational credentials without arguments, echo, or credential logs."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request

REPO = 'study734/jaemangho'
PROJECT = 'prj_mvcC7PWv6QstTX2blIJLFQgKZ4aJ'
TEAM = 'team_pDPXKxQmweWaDOLhvaiBQ9N1'
ROOT = Path(__file__).resolve().parent.parent


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True, cwd=ROOT)
    if result.returncode:
        raise RuntimeError('CLI 작업 실패: 로그인·권한·네트워크를 확인하세요. 비밀값을 포함할 수 있는 출력은 숨겼습니다.')
    return result.stdout


def registered():
    return {s['name'] for s in json.loads(run(['gh', 'secret', 'list', '--repo', REPO, '--json', 'name']))}


def hidden(prompt):
    if not sys.stdin.isatty():
        raise RuntimeError('입력이 숨겨지는 직접 터미널에서 실행하세요.')
    value = getpass.getpass(prompt).strip()
    if not value:
        raise RuntimeError('입력이 비어 있습니다.')
    return value


def register(name, value):
    run(['gh', 'secret', 'set', name, '--repo', REPO], value)
    print(f'{name}: 등록 완료 (값은 출력하지 않음)')


def validate_source(value):
    try:
        url = urllib.parse.urlsplit(value)
        _ = url.port
    except ValueError:
        raise RuntimeError('DB 연결 주소 형식이 올바르지 않습니다.') from None
    if url.scheme not in ('postgres', 'postgresql') or not url.hostname or '-pooler' in url.hostname or not url.password or not url.path.strip('/'):
        raise RuntimeError('비밀번호가 있는 PostgreSQL 직접 연결 주소가 필요합니다. 풀링 주소는 사용할 수 없습니다.')
    if urllib.parse.unquote(url.username or '') != 'jaemangho_backup':
        raise RuntimeError('운영 계정 대신 jaemangho_backup 읽기 전용 계정을 사용하세요.')
    if dict(urllib.parse.parse_qsl(url.query)).get('sslmode') not in ('require', 'verify-ca', 'verify-full'):
        raise RuntimeError('운영 연결에 sslmode=require 이상이 필요합니다.')


def verify_readonly(source):
    # URL은 stdin으로만 전달하고 SQL 결과만 받는다. 오류의 연결 정보는 출력하지 않는다.
    code = """
import pg from 'pg';
let input = ''; for await (const chunk of process.stdin) input += chunk;
const client = new pg.Client({connectionString: JSON.parse(input).url, connectionTimeoutMillis: 10000, query_timeout: 15000});
try {
  await client.connect();
  const {rows} = await client.query(`select
    current_setting('default_transaction_read_only') = 'on' as readonly,
    not (rolsuper or rolcreatedb or rolcreaterole or rolbypassrls)
      and not exists(select 1 from pg_auth_members where member=pg_roles.oid) as limited,
    (select count(*) > 0 and bool_and(has_table_privilege(current_user, c.oid, 'SELECT')
      and not has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      and not c.relrowsecurity)
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','p')) as tables,
    not has_schema_privilege(current_user, 'public', 'CREATE') and
      not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='S' and
          (not has_sequence_privilege(current_user,c.oid,'SELECT') or has_sequence_privilege(current_user,c.oid,'UPDATE,USAGE'))) as sequences
    from pg_roles where rolname=current_user`);
  if (!rows[0]?.readonly || !rows[0]?.limited || !rows[0]?.tables || !rows[0]?.sequences) throw new Error('permissions');
  console.log('readonly-confirmed');
} catch { process.exitCode=1; } finally { await client.end(); }
"""
    if run(['node', '--input-type=module', '-e', code], json.dumps({'url': source})).strip() != 'readonly-confirmed':
        raise RuntimeError('읽기 전용 권한을 확인하지 못했습니다.')


def load_or_create_key(file):
    if file.expanduser().is_symlink():
        raise RuntimeError('키 파일 심볼릭 링크는 사용할 수 없습니다.')
    file = file.expanduser().resolve()
    if file == ROOT or ROOT in file.parents or str(file).startswith('/tmp/'):
        raise RuntimeError('키는 저장소·임시 디렉터리 밖의 지속 보관 위치에 저장하세요.')
    file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if file.exists():
        if file.is_symlink() or not file.is_file() or file.stat().st_mode & 0o077:
            raise RuntimeError('기존 키 파일은 일반 파일이며 본인만 읽을 수 있어야 합니다.')
        key = file.read_text().strip()
    else:
        key = base64.b64encode(secrets.token_bytes(32)).decode()
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(key + '\n')
    try:
        decoded = base64.b64decode(key, validate=True)
    except ValueError:
        raise RuntimeError('보관된 키가 유효한 base64가 아닙니다.') from None
    if len(decoded) != 32 or base64.b64encode(decoded).decode() != key:
        raise RuntimeError('보관된 키는 무작위 32바이트 canonical base64여야 합니다.')
    return key, file


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['status', 'vercel-token', 'backup'])
    parser.add_argument('--key-file', type=Path, default=Path('~/.config/jaemangho-ops/backup.key'))
    args = parser.parse_args()
    if not shutil.which('gh'):
        raise RuntimeError('GitHub CLI gh가 필요합니다.')
    names = registered()
    if args.command == 'status':
        for name in ['CRON_SECRET', 'OPS_ALERT_WEBHOOK_URL', 'VERCEL_TOKEN', 'BACKUP_DATABASE_URL', 'BACKUP_ENCRYPTION_KEY']:
            print(f'{name}: {"등록됨" if name in names else "미등록"}')
    elif args.command == 'vercel-token':
        token = hidden('Vercel 해당 프로젝트/팀 토큰 (입력 숨김): ')
        req = urllib.request.Request(f'https://api.vercel.com/v13/deployments/jaemangho.vercel.app?teamId={TEAM}&withGitRepoInfo=true', headers={'Authorization': 'Bearer ' + token})
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
                target = json.load(response)
        except Exception:
            raise RuntimeError('토큰으로 대상 운영 배포를 조회하지 못했습니다. 범위·만료·권한을 확인하세요.') from None
        if target.get('projectId', target.get('project', {}).get('id')) != PROJECT or target.get('target') != 'production':
            raise RuntimeError('대상 프로젝트 운영 배포를 확인하지 못했습니다.')
        register('VERCEL_TOKEN', token)
    else:
        if 'BACKUP_ENCRYPTION_KEY' in names:
            raise RuntimeError('이미 암호화 키가 등록돼 있습니다. 기존 백업을 보존하기 위해 자동으로 교체하지 않습니다.')
        if not shutil.which('node'):
            raise RuntimeError('Node.js와 npm ci가 필요합니다.')
        source = hidden('jaemangho_backup 직접 DB 주소 (입력 숨김, 읽기 전용 연결 검사 실행): ')
        validate_source(source)
        verify_readonly(source)
        key, file = load_or_create_key(args.key_file)
        register('BACKUP_DATABASE_URL', source)
        register('BACKUP_ENCRYPTION_KEY', key)
        print(f'키의 독립 보관 사본: {file}. 이 파일을 삭제하지 말고 비밀 보관소에도 보관하세요.')
    print('활성화 플래그는 변경하지 않았습니다. 첫 실행 검증 뒤 별도로 활성화합니다.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyboardInterrupt):
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, RuntimeError) else '입력을 취소했습니다.', file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('등록하지 못했습니다. 파일 권한·CLI·입력 형식을 확인하세요. 비밀값을 포함할 수 있는 상세 오류는 숨겼습니다.', file=sys.stderr)
        sys.exit(1)
