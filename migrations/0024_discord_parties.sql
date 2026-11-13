-- 디스코드 /게임추천에서 고른 친구 묶음. 결과 메시지의 버튼(뽑기·세일·같이 도전·공통 게임)은 custom_id 100자 제한 때문에
-- 친구 id를 직접 담지 못하므로 이 행의 id(선택 interaction id)만 담는다. 하루가 지난 행은 새 행을 저장할 때 지운다.
-- 기존 코드는 이 테이블을 읽지 않으므로 이전 버전과 호환된다.
create table discord_parties (
  id text primary key check (id ~ '^\d{17,20}$'),
  owner_discord_id text not null check (owner_discord_id ~ '^\d{17,20}$'),
  discord_ids text[] not null check (cardinality(discord_ids) between 2 and 20),
  scope text not null check (scope in ('all', 'any', 'unowned')),
  preference text not null check (preference in ('balanced', 'familiar', 'fresh', 'recent')),
  created_at timestamptz not null default now()
);
create index discord_parties_created_at on discord_parties (created_at);
