-- bets 테이블에 설명(description)과 정산 기준(resolver) 컬럼 추가
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS resolver    text;
