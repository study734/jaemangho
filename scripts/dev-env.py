"""Shared development configuration for Git worktrees; never prints values."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PROJECT = 'prj_mvcC7PWv6QstTX2blIJLFQgKZ4aJ'
TEAM = 'team_pDPXKxQmweWaDOLhvaiBQ9N1'
EXTERNAL_SECRETS = {'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'STEAM_API_KEY', 'RIOT_API_KEY'}
KEYS = {
    'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'SESSION_SECRET', 'DEV_LOGIN',
    'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID',
    'DISCORD_PUBLIC_KEY', 'DISCORD_BOT_TOKEN', 'RIOT_API_KEY', 'STEAM_API_KEY',
    'CRON_SECRET', 'CHAT_LAUGH', 'OPS_ALERT_WEBHOOK_URL',
}
PROFILES = {
    'local': ['DATABASE_URL', 'SESSION_SECRET'],
    'discord': ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID',
                'DISCORD_PUBLIC_KEY', 'DISCORD_BOT_TOKEN', 'STEAM_API_KEY'],
    'steam': ['STEAM_API_KEY'], 'riot': ['RIOT_API_KEY'],
}
MARKER = '# jaemangho shared development environment v1'
HOOK = '''#!/bin/sh
# jaemangho shared development environment v1
[ "$3" = "1" ] || exit 0
common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
exec python3 "$common/jaemangho-dev-env/tool.py" sync
'''


class ConfigError(Exception):
    pass


def git(cwd, *args):
    env = {k: v for k, v in os.environ.items() if k not in {
        'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX',
    }}
    result = subprocess.run(['git', '-C', str(cwd), *args], env=env,
                            capture_output=True, text=True)
    if result.returncode:
        raise ConfigError('Git 조회 실패. 저장소 안에서 실행하세요.')
    return result.stdout.strip()


def paths(cwd):
    root = Path(git(cwd, 'rev-parse', '--show-toplevel'))
    common = Path(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
    store = common / 'jaemangho-dev-env'
    if store.is_symlink():
        raise ConfigError('공유 설정 디렉터리는 심볼릭 링크일 수 없습니다.')
    return root, common, store


def read(file):
    if file.is_symlink() or not file.is_file():
        raise ConfigError('설정 원본은 심볼릭 링크가 아닌 일반 파일이어야 합니다.')
    if file.stat().st_size > 65536:
        raise ConfigError('설정 파일이 너무 큽니다.')
    data = file.read_text()
    values = {}
    for line in data.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r'([A-Z_][A-Z_0-9]*)=(.*)', line)
        if not match:
            raise ConfigError('설정은 한 줄에 KEY=value 형식이어야 합니다.')
        key, value = match.groups()
        if key not in KEYS:
            # CLI-generated non-project variables must not enter the shared cache.
            if key.startswith('VERCEL_'):
                continue
            raise ConfigError('지원하지 않는 설정 키: ' + key)
        if key in values:
            raise ConfigError('중복 설정 키: ' + key)
        value = value.strip()
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                raise ConfigError('따옴표 형식 오류: ' + key) from None
        elif value.startswith("'"):
            if not value.endswith("'") or len(value) < 2:
                raise ConfigError('따옴표 형식 오류: ' + key)
            value = value[1:-1]
        if not isinstance(value, str) or any(c in value for c in '\r\n\x00'):
            raise ConfigError('여러 줄 값은 지원하지 않습니다: ' + key)
        values[key] = value
    return values


def validate(values):
    from urllib.parse import urlsplit
    if not values.get('DATABASE_URL') or len(values.get('SESSION_SECRET', '')) < 32:
        raise ConfigError('DATABASE_URL과 32자 이상 SESSION_SECRET을 먼저 준비하세요.')
    for key in ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']:
        if not values.get(key):
            continue
        try:
            url = urlsplit(values[key])
            valid = url.scheme in ['postgres', 'postgresql'] and bool(url.hostname and url.path.strip('/'))
            _ = url.port
        except ValueError:
            valid = False
        if not valid:
            raise ConfigError('PostgreSQL 주소 형식 오류: ' + key)
    for key, pattern in {
        'DISCORD_CLIENT_ID': r'\d{17,20}', 'DISCORD_GUILD_ID': r'\d{17,20}',
        'DISCORD_PUBLIC_KEY': r'[0-9a-fA-F]{64}', 'STEAM_API_KEY': r'[0-9a-fA-F]{32}',
        'RIOT_API_KEY': r'RGAPI-.+', 'DEV_LOGIN': r'[01]', 'CHAT_LAUGH': r'[01]',
    }.items():
        if values.get(key) and not re.fullmatch(pattern, values[key]):
            raise ConfigError('설정 형식 오류: ' + key)
    for key, minimum in [('DISCORD_BOT_TOKEN', 30), ('CRON_SECRET', 16)]:
        if values.get(key) and len(values[key]) < minimum:
            raise ConfigError('설정 길이 오류: ' + key)
    if values.get('DEV_LOGIN') != '1' and not all(values.get(k) for k in
            ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID']):
        raise ConfigError('개발 로그인 또는 실제 Discord 로그인 설정이 필요합니다.')


def encode(values):
    # Omit empty keys: migration URL fallback uses ?? and cannot fall back from ''.
    return MARKER + '\n' + '\n'.join(k + '=' + json.dumps(v, ensure_ascii=False)
                                     for k, v in sorted(values.items()) if v) + '\n'


def write_private(file, content, replace=False):
    if file.is_symlink():
        raise ConfigError('심볼릭 링크 대상에는 쓰지 않습니다.')
    file.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.dev-env-', dir=file.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
        if replace:
            os.replace(temporary, file)
        else:
            try:
                os.link(temporary, file)
            except FileExistsError:
                raise ConfigError('기존 파일을 보존했습니다. 교체하려면 --replace를 지정하세요.') from None
    finally:
        temporary.unlink(missing_ok=True)


def report(values):
    for profile, keys in PROFILES.items():
        missing = [k for k in keys if not values.get(k)]
        print(profile + ': ' + ('준비됨' if not missing else '미설정 ' + ', '.join(missing)))


def sync(root, store, replace=False):
    cache = store / 'development.env'
    if not cache.exists():
        raise ConfigError('공유 개발 설정이 없습니다. dev-env.py import 또는 refresh를 먼저 실행하세요.')
    values = read(cache)
    validate(values)
    if os.name != 'nt' and cache.stat().st_mode & 0o077:
        raise ConfigError('공유 원본 권한을 0600으로 제한하세요.')
    target = root / '.env.local'
    if target.is_symlink():
        raise ConfigError('기존 .env.local 심볼릭 링크를 보존했습니다. 직접 확인하세요.')
    if target.exists() and not replace:
        print('.env.local 기존 파일 보존. 최신 설정 적용: dev-env.py sync --replace')
        report(read(target))
        return
    write_private(target, encode(values), replace=replace)
    print('.env.local 개발 설정 복사 완료 (값은 출력하지 않음).')
    report(values)


def install(root, common, store):
    result = subprocess.run(['git', '-C', str(root), 'config', '--get', 'core.hooksPath'],
                            capture_output=True, text=True)
    if result.returncode not in [0, 1] or result.returncode == 0:
        raise ConfigError('기존 core.hooksPath를 보존했습니다. 기존 hook에서 dev-env.py sync를 연결하세요.')
    hook = common / 'hooks' / 'post-checkout'
    if hook.is_symlink() or (hook.exists() and hook.read_text() != HOOK):
        raise ConfigError('기존 post-checkout hook을 보존했습니다. dev-env.py sync를 기존 hook에 연결하세요.')
    values = read(store / 'development.env')
    validate(values)
    if store.is_symlink():
        raise ConfigError('공유 설정 디렉터리는 심볼릭 링크일 수 없습니다.')
    store.mkdir(mode=0o700, exist_ok=True)
    os.chmod(store, 0o700)
    write_private(store / 'tool.py', Path(__file__).read_text(), replace=True)
    write_private(hook, HOOK, replace=hook.exists())
    hook.chmod(0o700)
    print('이 저장소의 공용 post-checkout hook 설치 완료. 전역 Git 설정은 변경하지 않음.')


def vercel_command(root):
    cli = shutil.which('vercel')
    launcher = root / 'scripts' / 'agent-npm.sh'
    if cli:
        return [cli]
    elif launcher.is_file():
        return ['bash', str(launcher), 'exec', '--yes', '--package=vercel@63.1.2', '--', 'vercel']
    else:
        raise ConfigError('Vercel CLI 로그인·프로젝트 연결을 먼저 준비하세요. 원본은 변경하지 않았습니다.')


def refresh(root, store):
    from urllib.parse import urlsplit
    command = vercel_command(root)
    with tempfile.TemporaryDirectory(prefix='jmh-dev-env-') as directory:
        destination = Path(directory) / 'development.env'
        result = subprocess.run([*command, 'env', 'pull', str(destination), '--environment=development',
                                 '--project', PROJECT, '--scope', TEAM, '--yes'],
                                cwd=root, capture_output=True, text=True, timeout=60)
        if result.returncode or not destination.is_file():
            raise ConfigError('Vercel Development 조회 실패. 로그인·프로젝트 연결·설정을 확인하세요. CLI 출력은 숨겼습니다.')
        values = read(destination)
        cache = store / 'development.env'
        if cache.exists():
            local = read(cache)
            # Write-only cloud secrets are not a recoverable source. Keep their local backup.
            for key in EXTERNAL_SECRETS | {'OPS_ALERT_WEBHOOK_URL'}:
                if not values.get(key) and local.get(key):
                    values[key] = local[key]
            for key in ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']:
                if local.get(key) and urlsplit(local[key]).hostname in ['localhost', '127.0.0.1', '::1']:
                    values[key] = local[key]
        validate(values)
    write_private(store / 'development.env', encode(values), replace=True)
    print('Vercel Development로 공유 설정 갱신 완료. 기존 worktree는 변경하지 않음.')
    report(values)


def publish(root, store, replace=False):
    values = read(store / 'development.env')
    validate(values)
    command = vercel_command(root)
    keys = sorted(k for k, value in values.items() if value and k not in
                  ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'OPS_ALERT_WEBHOOK_URL'])
    for key in keys:
        args = [*command, 'env', 'add', key, 'development', '--project', PROJECT,
                '--scope', TEAM, '--sensitive' if key in EXTERNAL_SECRETS else '--no-sensitive', '--yes']
        if replace:
            args.append('--force')
        result = subprocess.run(args, input=values[key] + '\n', cwd=root,
                                capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise ConfigError(key + ': Development 등록 실패. 앞서 성공한 키는 남아 있습니다. '
                              '로그인·권한·기존 키를 확인하고 필요한 교체는 --replace로 재실행하세요. CLI 출력은 숨겼습니다.')
        print(key + ': Vercel Development 등록 완료 (값 숨김).')
    print('DB 주소·운영 알림은 로컬에 보존했습니다. Production은 변경하지 않았습니다.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['import', 'refresh', 'publish', 'install', 'sync', 'check', 'hook', 'uninstall'])
    parser.add_argument('--source', type=Path)
    parser.add_argument('--replace', action='store_true')
    parser.add_argument('--confirm-development', action='store_true')
    parser.add_argument('--profile', choices=PROFILES, default='local')
    args = parser.parse_args()
    root, common, store = paths(Path.cwd())
    if args.command == 'hook':
        data = sys.stdin.read(65537)
        if len(data) > 65536:
            raise ConfigError('hook 입력이 너무 큽니다.')
        payload = json.loads(data)
        target, target_common, _ = paths(Path(payload['cwd']))
        if target_common != common:
            raise ConfigError('다른 저장소에는 설정을 복사하지 않습니다.')
        sync(target, store)
    elif args.command == 'import':
        if not args.source or not args.confirm_development:
            raise ConfigError('--source와 --confirm-development가 필요합니다. 운영 원본을 가져오지 마세요.')
        if store.is_symlink():
            raise ConfigError('공유 설정 디렉터리는 심볼릭 링크일 수 없습니다.')
        values = read(args.source)
        validate(values)
        store.mkdir(mode=0o700, exist_ok=True)
        os.chmod(store, 0o700)
        write_private(store / 'development.env', encode(values), replace=args.replace)
        print('개발용으로 확인한 원본을 공유 설정에 보관했습니다 (Git 메타데이터, 권한 0600).')
        report(values)
    elif args.command == 'refresh':
        if not args.confirm_development:
            raise ConfigError('--confirm-development가 필요합니다. Development에 개발용 값만 등록하세요.')
        if store.is_symlink():
            raise ConfigError('공유 설정 디렉터리는 심볼릭 링크일 수 없습니다.')
        store.mkdir(mode=0o700, exist_ok=True)
        os.chmod(store, 0o700)
        refresh(root, store)
    elif args.command == 'install':
        install(root, common, store)
    elif args.command == 'publish':
        if not args.confirm_development:
            raise ConfigError('--confirm-development가 필요합니다. 개발용 키만 등록하세요.')
        publish(root, store, args.replace)
    elif args.command == 'sync':
        sync(root, store, args.replace)
    elif args.command == 'check':
        values = read(root / '.env.local')
        validate(values)
        report(values)
        if any(not values.get(k) for k in PROFILES[args.profile]):
            raise ConfigError('요청한 기능의 필수 설정이 누락됐습니다.')
    else:
        hook = common / 'hooks' / 'post-checkout'
        if hook.is_symlink() or not hook.is_file() or hook.read_text() != HOOK:
            raise ConfigError('이 도구가 설치한 hook이 아니므로 삭제하지 않습니다.')
        hook.unlink()
        print('자동 복사 hook 제거 완료. 설정 원본과 각 worktree 파일은 보존했습니다.')


if __name__ == '__main__':
    try:
        main()
    except ConfigError as error:
        print('[dev-env] ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        print('[dev-env] 준비 실패. 파일·권한·입력·CLI 상태를 확인하세요. 비밀값을 포함할 수 있는 상세 오류는 숨겼습니다.', file=sys.stderr)
        sys.exit(1)
