-- 동기화(API)로 생성된 보트: 운영자 표기
alter table public.bets
  add column if not exists is_admin_generated boolean not null default false;

alter table public.bets
  add column if not exists author_name text;

comment on column public.bets.is_admin_generated is 'API 동기화 등으로 자동 생성된 보트 여부';
comment on column public.bets.author_name is '표시용 작성자명 (예: VOTERS 운영자)';

