-- bets: 직접 클라이언트(anon) INSERT 차단 — 앱은 API + service_role로만 쓰기.
-- Supabase service_role 연결은 RLS를 우회하므로 서버 라우트의 insert는 계속 동작합니다.

alter table public.bets enable row level security;

drop policy if exists "bets_select_public" on public.bets;
create policy "bets_select_public"
  on public.bets
  for select
  to anon, authenticated
  using (true);

-- insert/update/delete: anon·authenticated 에 대한 정책 없음 → 거부 (service_role 은 RLS 우회)

comment on table public.bets is
  'RLS enabled; writes via service_role API routes only.';
