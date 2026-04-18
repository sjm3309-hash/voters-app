-- auth.users 가입 시 public.profiles 행 자동 생성 + 기존 유저 백필

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, pebbles, welcome_bonus_claimed)
  values (new.id, 0, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- 기존 가입자 중 프로필 없는 계정 백필
insert into public.profiles (id, pebbles, welcome_bonus_claimed)
select au.id, 0, false
from auth.users au
where not exists (select 1 from public.profiles p where p.id = au.id)
on conflict (id) do nothing;

comment on function public.handle_new_user() is '신규 auth.users 행에 대응하는 profiles 행 생성';
