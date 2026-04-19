-- ── A. bet_history → Realtime 구독 대상 추가 ──────────────────────────────
-- 클라이언트에서 다른 유저의 베팅이 즉시 반영되도록 Realtime 활성화

alter publication supabase_realtime add table public.bet_history;

-- ── B. bet_claims — 당첨 수령 서버 검증 테이블 ───────────────────────────
-- localStorage 기반 중복 수령 방지 → DB 수준에서 unique 제약으로 보장

create table if not exists public.bet_claims (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  market_id   uuid        not null,
  payout      integer     not null check (payout > 0),
  claimed_at  timestamptz not null default now(),
  unique (user_id, market_id)   -- 동일 보트 중복 수령 방지 (DB 잠금)
);

comment on table  public.bet_claims is '보트 당첨 수령 이력 (서버 중복 수령 방지)';
comment on column public.bet_claims.payout    is '지급된 배당 페블 수량';
comment on column public.bet_claims.market_id is 'bets.id (UUID 보트 id)';

create index if not exists bet_claims_user_id_idx
  on public.bet_claims (user_id, claimed_at desc);

alter table public.bet_claims enable row level security;

-- 본인 수령 내역 조회
create policy "bet_claims_select_own"
  on public.bet_claims
  for select
  using (auth.uid() = user_id);

-- 서비스 롤만 insert (API 서버에서만 기록)
create policy "bet_claims_insert_service"
  on public.bet_claims
  for insert
  with check (true);
