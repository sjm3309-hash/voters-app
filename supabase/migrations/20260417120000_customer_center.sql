-- 고객센터: 1:1 문의(inquiry, 비공개) / 베팅 아이디어(proposal, 공개)
-- Supabase SQL 에디터에서 실행하거나: supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.customer_center_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null,
  category text not null check (category in ('inquiry', 'proposal')),
  is_private boolean not null default false,
  like_count integer not null default 0,
  author_display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cc_category_private_check check (
    (category = 'inquiry' and is_private = true) or (category = 'proposal' and is_private = false)
  )
);

create index if not exists customer_center_posts_category_created_idx
  on public.customer_center_posts (category, created_at desc);

create index if not exists customer_center_posts_category_likes_idx
  on public.customer_center_posts (category, like_count desc, created_at desc);

create table if not exists public.customer_center_likes (
  post_id uuid not null references public.customer_center_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.customer_center_posts enable row level security;
alter table public.customer_center_likes enable row level security;

-- 읽기 정책:
-- - proposal: 모두 읽기 가능
-- - inquiry: 본인 또는 운영자(서비스 롤/정책 외 admin 이메일 등)만
create policy "cc_read_public_proposals"
on public.customer_center_posts
for select
using (category = 'proposal');

create policy "cc_read_own_inquiries"
on public.customer_center_posts
for select
using (category = 'inquiry' and auth.uid() = user_id);

-- 작성 정책: 로그인 유저만, inquiry는 private 강제, proposal은 public 강제
create policy "cc_insert_own_posts"
on public.customer_center_posts
for insert
with check (
  auth.uid() = user_id
  and (
    (category = 'inquiry' and is_private = true)
    or (category = 'proposal' and is_private = false)
  )
);

-- 수정/삭제: 본인만
create policy "cc_update_own_posts"
on public.customer_center_posts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "cc_delete_own_posts"
on public.customer_center_posts
for delete
using (auth.uid() = user_id);

-- likes: 로그인 유저만
create policy "cc_like_insert"
on public.customer_center_likes
for insert
with check (auth.uid() = user_id);

create policy "cc_like_delete"
on public.customer_center_likes
for delete
using (auth.uid() = user_id);

-- like_count는 클라이언트에서 직접 update하지 않고 RPC/트리거를 권장하지만,
-- 현재 앱은 단순화를 위해 서버(서비스 롤)로 처리하거나 update 정책으로 허용할 수 있습니다.

