-- 페블: profiles.pebbles 를 단일 소스로 사용 (클라이언트 localStorage 의존 제거용)
-- 기존 프로젝트에 profiles 가 있다고 가정합니다 (bankruptcy-draw 등에서 이미 사용).

alter table public.profiles
  add column if not exists pebbles bigint not null default 0;

alter table public.profiles
  add column if not exists welcome_bonus_claimed boolean not null default false;

comment on column public.profiles.pebbles is '보유 페블 (단일 소스)';
comment on column public.profiles.welcome_bonus_claimed is '가입 환영 보너스(3000P) 서버 지급 완료 여부';

-- 마이그레이션 시점에 이미 존재하던 행은 환영 보너스 중복 지급 방지
update public.profiles set welcome_bonus_claimed = true where welcome_bonus_claimed = false;

-- 원자적 증감 (서비스 롤 API 전용 — anon 에게 GRANT 하지 않음)
create or replace function public.adjust_pebbles_atomic(p_user_id uuid, p_delta bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new bigint;
begin
  if p_delta = 0 then
    return coalesce((select pebbles from public.profiles where id = p_user_id), 0);
  end if;

  insert into public.profiles (id, pebbles, welcome_bonus_claimed)
  values (p_user_id, 0, false)
  on conflict (id) do nothing;

  update public.profiles
  set pebbles = coalesce(pebbles, 0) + p_delta
  where id = p_user_id
    and (coalesce(pebbles, 0) + p_delta >= 0)
  returning pebbles into v_new;

  if not found then
    if exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'insufficient_pebbles';
    else
      raise exception 'profile_missing';
    end if;
  end if;

  return v_new;
end;
$$;

revoke all on function public.adjust_pebbles_atomic(uuid, bigint) from public;
grant execute on function public.adjust_pebbles_atomic(uuid, bigint) to service_role;

-- 최초 로드 시 프로필 행 보장 + 환영 보너스 1회 지급 후 잔액 반환
create or replace function public.bootstrap_profile_balance(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pebbles bigint;
  v_claimed boolean;
  bonus constant bigint := 3000;
begin
  insert into public.profiles (id, pebbles, welcome_bonus_claimed)
  values (p_user_id, 0, false)
  on conflict (id) do nothing;

  select coalesce(pebbles, 0), welcome_bonus_claimed
  into v_pebbles, v_claimed
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_missing';
  end if;

  if not v_claimed then
    update public.profiles
    set pebbles = coalesce(pebbles, 0) + bonus,
        welcome_bonus_claimed = true
    where id = p_user_id
    returning pebbles into v_pebbles;
  end if;

  return coalesce(v_pebbles, 0);
end;
$$;

revoke all on function public.bootstrap_profile_balance(uuid) from public;
grant execute on function public.bootstrap_profile_balance(uuid) to service_role;
