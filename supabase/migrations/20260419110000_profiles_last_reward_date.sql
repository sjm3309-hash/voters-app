-- profiles 테이블에 일일 출석 보상 날짜 컬럼 추가
-- 서버 기준: KST 자정(00:00) 리셋

alter table public.profiles
  add column if not exists last_reward_date date;

comment on column public.profiles.last_reward_date
  is '마지막 일일 출석 보상 지급일 (KST YYYY-MM-DD). NULL이면 미수령.';
