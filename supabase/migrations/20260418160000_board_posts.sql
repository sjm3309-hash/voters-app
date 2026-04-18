-- 게시판 글 (목록 페이지네이션용)
create table if not exists public.board_posts (
  id text primary key,
  title text not null,
  content text not null,
  content_html text,
  category text not null
    check (category in ('sports', 'fun', 'stocks', 'crypto', 'politics', 'game')),
  author_name text not null,
  thumbnail_url text,
  images jsonb not null default '[]'::jsonb,
  views integer not null default 0,
  comment_count integer not null default 0,
  is_hot boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_posts_created_at_desc_idx
  on public.board_posts (created_at desc);

create index if not exists board_posts_category_created_idx
  on public.board_posts (category, created_at desc);

create index if not exists board_posts_views_comment_created_idx
  on public.board_posts (views desc, comment_count desc, created_at desc);

alter table public.board_posts enable row level security;

create policy "board_posts_select_public"
  on public.board_posts
  for select
  to anon, authenticated
  using (true);

comment on table public.board_posts is '게시판 글 — 쓰기는 API(service_role)만 사용';
