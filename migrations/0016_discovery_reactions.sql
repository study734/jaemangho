-- 발견 한 건에 멤버별 반응 하나. 기존 코드·수집 테이블과 독립적이다.
create table discovery_reactions (
  card_id text not null check (length(card_id) between 1 and 500),
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
