-- pebble_transactions 테이블 생성
-- 페블 획득·사용 이력을 서버에서 영구 보관하기 위한 테이블

create table if not exists public.pebble_transactions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  amount       integer     not null,            -- 양수=획득, 음수=사용
  balance_after integer    not null default 0,  -- 트랜잭션 후 잔액
  type         text        not null default 'other',
  description  text        not null default '',
  created_at   timestamptz not null default now()
);

comment on table  public.pebble_transactions is '페블 획득·사용 트랜잭션 이력';
comment on column public.pebble_transactions.amount       is '변동량 (양수=획득, 음수=사용)';
comment on column public.pebble_transactions.balance_after is '트랜잭션 후 잔액';
comment on column public.pebble_transactions.type         is '거래 유형 (admin_grant, daily_reward, level_up, bet_win, ...)';

-- 조회 성능을 위한 인덱스
create index if not exists pebble_transactions_user_id_idx
  on public.pebble_transactions (user_id, created_at desc);

-- RLS 활성화
alter table public.pebble_transactions enable row level security;

-- 본인 내역 조회
create policy "pebble_transactions_select_own"
  on public.pebble_transactions
  for select
  using (auth.uid() = user_id);

-- 서비스 롤만 insert/update/delete 가능 (API 서버에서만 사용)
create policy "pebble_transactions_insert_service"
  on public.pebble_transactions
  for insert
  with check (true);
