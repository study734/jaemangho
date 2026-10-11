# 무료 운영 용량과 활성화

2026-10-11 공식 문서 기준. 한도와 아래 예상치는 다른 계정·프로젝트 사용량까지 보장하지 않는다. 실제 누적 사용량은 각 공급자의 Usage에서 확인한다. 무료 한도 부족으로 서비스가 멈추는 경우도 있으므로 유료 전환은 운영자 판단이다.

## 확인한 현재 상태

- Vercel 팀: Hobby, active. 청구 조회 API는 `costs_not_found`를 반환하여 실제 CPU·메모리·전송 사용량은 확보하지 못했다. 비용 데이터 없음은 사용량 0이 아니다.
- Cloudflare: 운영자가 Workers Free임을 확인했다. 결제 조회 권한은 없으며 Worker 예약은 5분마다 실행된다.
- GitHub: 공개 저장소, 표준 Ubuntu 러너. 확인 당시 보관 아티팩트 5개 약 76 MB. 다른 저장소·Packages 용량은 포함하지 않는다.
- Neon: 실제 Free 조직과 PostgreSQL 18을 확인했다. 10월 3일 시작 소비 기간의 조회 당시 연산 28,592 CU-second = 약 7.94 CU-hour, 저장 약 36.2 MB, 외부 전송 약 19.6 MB. 컴퓨트 최소·최대 모두 0.25 CU이며 절전 설정 0은 공급자의 기본 유휴 절전을 뜻한다. 이 수치는 조회 시점의 스냅샷이며 이후 트래픽이 추가된다.
- 자동 롤백·운영 백업: 필요한 Secrets 등록과 첫 실행 검증 전에는 비활성이다. 테스트 데이터 복원 연습 성공과 실제 운영 백업 성공은 다르다.

## 감시가 무료 DB를 계속 깨우지 않도록 구성

Worker는 5분마다 `/api/health/live`를 기본 Vercel 주소와 `www.jaemangho.shop`에서 확인한다. 이 경로는 DB·인증 모듈을 로드하지 않고 캐시하지 않는다. 실행 상태만 확인하며 DB 정상 여부를 뜻하지 않는다. Secret은 기본 Vercel 주소의 인증된 운영 API에만 보낸다. 사용자 도메인에는 보내지 않는다. HTTP 리디렉션은 따라가지 않는다.

DB 헬스·복구·운영 점검은 UTC 매시 00/30분 구간에서 한 번 수행한다. Worker 상태에 마지막 DB 점검 시각을 보존한다. DB/운영 요청이 실패하면 다음 5분 실행에서 재확인한다. 정상화 전 liveness 성공만으로 DB 장애를 해제하지 않는다. 정상 시 자동 복구의 실행 지연은 최대 약 30분이며 플랫폼 예약 지연은 별도다. 사이트·도메인 장애는 5분 간격, DB 장애 최초 발견은 30분 간격이다. 발견 이후 10분 지속 실패를 알린다. 복구 실행이 완료돼도 채팅의 개별 실패 경고는 관리자 상태에서 판단한다.

GitHub 보조 점검은 02/32분, Smoke는 03/33분에 예약하여 같은 DB 활성 구간을 사용하도록 한다. GitHub 예약 지연으로 실제 실행이 다른 구간에 들어갈 수 있다. 완료한 HTTP 요청의 타이머와 스트림을 정리하여 Durable Object가 불필요하게 활성 상태로 남지 않게 한다.

Neon Free는 월 100 CU-hour/프로젝트, 최소 컴퓨트 0.25 CU, 5분 유휴 후 절전을 제공한다. 5분 이하마다 연결하면 하루 종일 깨어 있을 수 있으며 30일 기준 `0.25 × 24 × 30 = 180 CU-hour`다. 변경 후 정상 감시를 30분마다 5분 활성으로 계산하면 `0.25 × 48 × (5/60) × 30 = 30 CU-hour`다. 실행시간, 예약 지연, 자동 동기화, 실제 방문자, 컴퓨트 자동 확장이 더해지므로 이것은 예상 최소 비용이며 실제 월 사용량 보장이 아니다. 31일 기준 각각 186/31 CU-hour다.

## 서비스별 무료 한도

| 서비스 | 공식 무료 한도 | 이번 운영 자동화의 예상/제약 |
| --- | --- | --- |
| Workers Free | 일 100,000 요청, 요청 CPU 10 ms | 예약 288회/일. 사용자 트래픽을 Worker로 프록시하지 않음. 실제 CPU·DO 활성 시간도 확인해야 함 |
| SQLite Durable Objects Free | 일 100,000 요청, 13,000 GB-s, 5백만 행 읽기, 10만 행 쓰기, 계정 5 GB 저장 | singleton 상태·잠금만 보관. 128 MB로 24시간 계속 활성이어도 11,059 GB-s/일이지만 다른 Object 사용량은 별도이며 CPU·SQL 한도도 적용됨 |
| Vercel Hobby / Fluid | 월 함수 100만 호출, CPU 4시간, 메모리 360 GB-hour, 전송 100 GB | 정상 자동 감시·점검·Smoke 약 36,000 HTTP 요청/30일. 함수/CPU 소비는 실제 런타임과 방문자에 따라 달라짐 |
| Neon Free | 월 100 CU-hour, 저장 0.5 GB/프로젝트, 외부 전송 5 GB/월 | 감시가 절전을 방해하지 않도록 변경. 매일 전체 dump의 전송도 포함되며 실제 DB 사용량 확인 필요 |
| GitHub Free | 공개 저장소 표준 러너 시간 무료, 아티팩트·Packages 합계 500 MB, 저장소 캐시 10 GB | 이 저장소는 업로드 전 400 MB 예산 검사. 백업 1회 최대 10 MB, 30일 보관 유지. 초과하면 기존 백업을 지우지 않고 업로드 중단·개입 알림 |

백업 예산 검사는 현재 보관량과 30일 예상 보관량 중 큰 값을 사용하고 ZIP/메타데이터 여유를 포함한다. 다른 저장소·Packages와 동시 업로드까지 원자적으로 제한할 수는 없다. GitHub 계정 Billing에서 Actions·Packages 예산을 `$0`으로 설정하고 초과 사용 중단을 켜는 것은 별도의 계정 설정 결정이다. 이 구현은 계정 결제 정책을 변경하지 않는다. 큰 DB는 읽은 후 업로드 예산에서 실패할 수 있으므로 Neon 전송량도 확인한다.

## 숨김 입력으로 Secrets 등록

저장소에서 Python 3, Node.js, GitHub CLI 로그인 및 `npm ci`가 필요하다. 아래 명령은 기존 로그인으로 GitHub Secret을 등록한다. 값은 명령 인수·기록·대화에 쓰지 않는다.

```bash
rtk proxy python3 scripts/register-ops-secrets.py status
rtk proxy python3 scripts/register-ops-secrets.py vercel-token
rtk proxy python3 scripts/register-ops-secrets.py neon-key
rtk proxy python3 scripts/register-ops-secrets.py backup
```

Vercel 토큰은 [개인 계정 Tokens](https://vercel.com/account/tokens)에서 생성한다. `jaemangho-operations`처럼 이름을 붙이고 해당 팀의 재망호 프로젝트 범위를 선택한다. 만료 시점은 운영자가 관리한다. CLI 도구는 숨김 입력을 받고 고정 프로젝트 운영 배포 조회가 되는지 검사한 후 `VERCEL_TOKEN`을 등록한다. 로그인용 OAuth 토큰을 복사하여 CI에 쓰지 않는다.

백업은 `jaemangho_backup` 역할의 직접 DB 주소를 숨김 입력으로 받는다. 입력 직후 읽기 전용 연결 검사만 수행한다. `default_transaction_read_only`, 관리자 권한 부재, public 테이블 SELECT 가능·쓰기 권한 부재를 확인한다. 풀링 주소와 운영 앱 계정은 거부한다. 역할이 없으면 운영자 승인 후 아래 SQL을 실행한다.

```bash
# DB 소유자 접속은 개인 환경에서 준비하고 비밀번호는 명령에 쓰지 않는다.
# APP_OWNER는 향후 앱 마이그레이션을 실행하는 실제 DB 소유자 역할로 바꾼다.
rtk proxy psql -X -v APP_OWNER=neondb_owner -f scripts/backup-role.sql
```

SQL은 로그인 가능한 읽기 전용 역할을 추가하며 현재·향후 public 테이블/시퀀스에 SELECT만 부여한다. 운영 권한 변경이므로 실행 전 사람 확인이 필요하다. 현재 소유자는 `select distinct pg_get_userbyid(relowner) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p');`로 확인한다. RLS 적용 테이블은 전체 백업을 별도 검토해야 하며 등록 도구가 거부한다. 권한 변경 후 Neon Connect에서 해당 역할의 직접 연결 주소를 받는다.

암호화 키는 `~/.config/jaemangho-ops/backup.key`에 권한 0600으로 만들고 같은 값을 GitHub에 등록한다. GitHub와 별도의 지속 보관 사본이다. 다른 위치는 `--key-file`로 지정할 수 있으나 저장소·임시 디렉터리에는 보관하지 않는다. 비밀 보관소에도 복사하고 로컬 파일을 삭제하지 않는다. 기존 GitHub 암호화 키는 교체하지 않는다. 등록 실패 후 재실행은 개인 파일의 동일 키를 재사용한다. 도구는 활성화 플래그를 바꾸지 않는다.

등록 후 Smoke 정상 baseline 확보 → 자동 롤백 활성화, 운영 암호화 백업 첫 성공 → 보관 파일 복원 첫 성공 → Worker 백업 공백 감시 활성화 순으로 진행한다. 운영 DB 복원이나 실제 장애를 만들며 롤백을 시험하지 않는다.

실제 Neon DB는 PostgreSQL 18이다. 백업·보관 파일 복원·가짜 데이터 복원 연습은 모두 PostgreSQL 18과 공식 PGDG의 client 18을 사용한다. pg_dump 17은 더 최신인 서버 18의 백업을 거부하므로 구버전 도구의 복원 연습 성공으로 운영 백업 호환성을 판단하지 않는다. 백업 범위는 재망호의 모든 데이터가 있는 `public` 스키마이며, Neon의 별도 관리 인증 스키마는 포함하지 않는다. 앱은 public의 Better Auth 테이블을 사용한다. 새 기능에서 public 밖에 데이터를 저장하면 백업 범위·읽기 권한·복원 검증을 함께 확장해야 한다. 복원 연습은 별도 관리 스키마를 읽지 못하는 SELECT 전용 역할로 수행한다.

## Neon 사용량 보호 활성화

Neon Console의 API keys에서 대상 프로젝트를 조회할 수 있는 최소 범위의 키를 준비하고 `neon-key` 명령에 숨김 입력한다. 등록 도구는 고정된 프로젝트에 GET 요청만 하고 GitHub `NEON_API_KEY` Secret에 등록한다. API key 자체의 권한이 읽기 전용이라는 보장은 없으므로 계정에서 범위를 확인한다. OAuth 로그인 토큰을 대신 등록하지 않는다. 앱·Worker·DB에는 키를 저장하지 않는다.

CI 통과·PR 머지·운영 배포·Worker의 `budget_paused` 대응 배포 후 **Free usage protection**을 수동 실행한다. 첫 성공과 관리자 화면의 최신 연산·전송 숫자를 확인한다. 이후 UTC 00/06/12/18:05에 실행한다. API 실패도 앱에 확인 불가로 보고해 이미 중단된 수집을 잘못 재개하지 않는다. 등록 이후 키 폐기·만료는 사용량 점검 실패로 알린다.

연산·전송의 80%에서 예약 채팅 수집·복구를 48시간에 한 번으로 줄이고 90%에서 중단한다. 중단은 75% 미만, 감속은 70% 미만의 새 성공 샘플에서 자동 해제한다. 조회 실패·12시간 지난 샘플은 감속하되 기존 중단은 유지한다. 일반 감시·백업·배포 검사와 관리자 수동 수집은 유지한다. 과금 API가 제공되지 않는 다른 공급자·사용자 트래픽의 한도는 보장하지 않는다.

## 공식 근거

- [Neon 플랜](https://neon.com/docs/introduction/plans), [컴퓨트 절전](https://neon.com/docs/introduction/compute-lifecycle)
- [Neon Free 프로젝트 사용량](https://neon.com/docs/introduction/usage-calculations), [Neon API keys](https://neon.com/docs/manage/api-keys)
- [Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects 가격](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel 토큰](https://vercel.com/docs/accounts/access-tokens)
- [GitHub Actions 과금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
