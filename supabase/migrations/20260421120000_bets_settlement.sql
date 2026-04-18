-- 정산(결과 확정) 시 당첨 선택지 저장 — 확정 시각은 기존 `confirmed_at` 컬럼을 사용합니다.
-- 앱의 option id는 `${bets.id}-opt-${i}` 형태 문자열
alter table public.bets add column if not exists winning_option_id text;

comment on column public.bets.winning_option_id is '정산 확정 시 당첨 선택지 id (클라이언트 옵션 id)';
