-- 이전 버전 마이그레이션으로 추가되었을 수 있는 settled_at 제거.
-- 결과 확정 시각은 bets.confirmed_at 에만 저장합니다.
alter table public.bets drop column if exists settled_at;
