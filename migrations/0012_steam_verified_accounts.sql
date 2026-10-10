-- Steam OpenID 연결은 기존의 임의 지정 가능한 owner_id와 별도로 증명한다.
create table steam_verified_accounts (
  steam_id text primary key references steam_members (steam_id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index steam_verified_accounts_user on steam_verified_accounts (user_id);

-- 콜백 상태와 공급자 응답 nonce는 재사용을 막기 위해 짧게 보관한다.
create table steam_openid_challenges (
  state text primary key,
  user_id text not null references "user" (id) on delete cascade,
  return_to text not null,
  expires_at timestamptz not null
);
create index steam_openid_challenges_expires on steam_openid_challenges (expires_at);

create table steam_openid_nonces (
  nonce text primary key,
  expires_at timestamptz not null
);
create index steam_openid_nonces_expires on steam_openid_nonces (expires_at);

-- 실제 고지된 저장 국가를 요청 시점의 증거로 남긴다.
alter table steam_collection_requests add column storage_country text;
