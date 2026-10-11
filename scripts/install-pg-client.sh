#!/bin/sh
set -eu

# node:24-trixie 예약 작업에서 운영 Neon PostgreSQL 18과 동일한 도구를 사용한다.
# PGDG 공식 HTTPS 저장소의 서명 검증을 유지한다.
apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl
install -d /usr/share/postgresql-common/pgdg
curl --fail --silent --show-error --retry 3 --max-time 60 \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
printf '%s\n' 'Types: deb' 'URIs: https://apt.postgresql.org/pub/repos/apt' \
  'Suites: trixie-pgdg' 'Components: main' \
  'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' \
  > /etc/apt/sources.list.d/pgdg.sources
apt-get update
apt-get install --yes --no-install-recommends postgresql-client-18
pg_dump --version
pg_restore --version
