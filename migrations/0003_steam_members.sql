-- Steam 멤버 목록(식별 정보만). 보유 게임은 Steam에서 매번 받아오므로 저장하지 않는다.
create table if not exists steam_members (
  steam_id text primary key,
  persona_name text not null,
  avatar text,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now()
);
