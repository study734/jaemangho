#!/usr/bin/env bash
# 클라우드 개발 세션(Claude Code on the web)의 개발 준비. 로컬 컴퓨터에서는 아무것도 하지 않는다.
#   start : 로컬 Postgres(개발 DB jaemangho, 테스트 DB jaemangho_test)를 켜고 없으면 .env.local을 만든다. SessionStart hook용(수 초).
#   setup : start + 의존성 설치(npm ci) + 개발 DB 마이그레이션. 클라우드 환경의 setup script용.
# 값은 출력하지 않는다. 이미 있는 .env.local·DB는 덮어쓰지 않는다.
set -euo pipefail
mode="${1:-start}"
case "$mode" in start|setup) ;; *) echo "usage: scripts/cloud-dev.sh start|setup" >&2; exit 2 ;; esac
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

root="$(cd "$(dirname "$0")/.." && pwd)"
port=54329
dir=/var/tmp/jaemangho-pg
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
if [ -z "$bin" ] || ! id postgres >/dev/null 2>&1; then
  echo "[cloud-dev] PostgreSQL 서버가 없어 DB 준비를 건너뜁니다. DB 테스트는 TEST_DATABASE_URL 없이 건너뛰어집니다." >&2
else
  mkdir -p "$dir" && chown postgres "$dir"
  [ -d "$dir/data" ] || su postgres -c "'$bin/initdb' -D '$dir/data' -A trust -U postgres" >/dev/null
  # 컨테이너가 재시작되면 데이터는 남고 프로세스만 사라진다. 꺼져 있을 때만 켠다.
  su postgres -c "'$bin/pg_ctl' -D '$dir/data' status" >/dev/null 2>&1 \
    || su postgres -c "'$bin/pg_ctl' -D '$dir/data' -o '-p $port -k $dir' -l '$dir/server.log' -w start" >/dev/null
  for db in jaemangho jaemangho_test; do
    psql -h 127.0.0.1 -p "$port" -U postgres -tAc "select 1 from pg_database where datname = '$db'" | grep -q 1 \
      || psql -h 127.0.0.1 -p "$port" -U postgres -qc "create database $db"
  done
  echo "[cloud-dev] Postgres 준비: 127.0.0.1:$port (jaemangho, jaemangho_test)"
fi

# 개발 서버용. SESSION_SECRET은 이 컨테이너의 로컬 개발 DB에만 쓰는 무작위 값이다.
if [ ! -e "$root/.env.local" ]; then
  umask 077
  printf 'DATABASE_URL=postgres://postgres@127.0.0.1:%s/jaemangho\nSESSION_SECRET=%s\nDEV_LOGIN=1\n' "$port" "$(openssl rand -hex 32)" > "$root/.env.local"
  echo "[cloud-dev] .env.local 생성 (로컬 DB · DEV_LOGIN=1). 외부 연동 키는 비어 있습니다."
fi

if [ "$mode" = setup ]; then
  cd "$root"
  npm ci --no-audit --no-fund >/dev/null
  # .env.local의 DATABASE_URL이 아니라 이 컨테이너의 개발 DB에만 적용한다(다른 DB를 가리키는 기존 설정 보호).
  env -u DATABASE_URL_UNPOOLED -u POSTGRES_URL DATABASE_URL="postgres://postgres@127.0.0.1:$port/jaemangho" node scripts/migrate.mjs >/dev/null
  echo "[cloud-dev] 의존성 설치와 개발 DB 마이그레이션 완료"
fi
