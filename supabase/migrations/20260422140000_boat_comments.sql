-- 보트(마켓) 상세 댓글 — Realtime INSERT 구독용

create table if not exists public.boat_comments (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_display text not null,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists boat_comments_bet_created_idx
  on public.boat_comments (bet_id, created_at asc);

comment on table public.boat_comments is '보트 상세 댓글 (Realtime 구독 대상)';

alter table public.boat_comments replica identity full;

alter publication supabase_realtime add table public.boat_comments;

alter table public.boat_comments enable row level security;

drop policy if exists "boat_comments_select_all" on public.boat_comments;
create policy "boat_comments_select_all"
  on public.boat_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "boat_comments_insert_own" on public.boat_comments;
create policy "boat_comments_insert_own"
  on public.boat_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);
