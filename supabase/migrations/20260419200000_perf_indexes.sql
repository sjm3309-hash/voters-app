-- ────────────────────────────────────────────────────────────────────────────
-- 성능 개선 인덱스
-- 적용 방법: Supabase 대시보드 > SQL Editor 에서 실행
-- ────────────────────────────────────────────────────────────────────────────

-- 1. bets 피드 쿼리 최적화
--    active/waiting 상태 보트 조회 (status null 포함): (status, created_at)
create index if not exists bets_feed_open_idx
  on public.bets (status, created_at desc nulls last);

--    closed 상태 보트 조회: confirmed_at 최신 3일 필터
create index if not exists bets_feed_closed_idx
  on public.bets (status, confirmed_at desc)
  where status in ('closed', 'settled', 'resolved', 'completed', 'cancelled', 'void');

-- 2. bet_history 집계 (market_id 기준 — sumPoolsByMarketIds / sumOptionStakesByMarketIds)
--    이미 있을 수 있으나 없으면 생성
create index if not exists bet_history_market_id_idx
  on public.bet_history (market_id);

create index if not exists bet_history_market_option_idx
  on public.bet_history (market_id, option_id);

-- 3. boat_comments 댓글 수 집계 최적화
--    is_deleted = false 인 활성 댓글만 대상으로 부분 인덱스
create index if not exists boat_comments_active_bet_idx
  on public.boat_comments (bet_id)
  where is_deleted = false;

-- 4. board_posts 리스트 쿼리 (category 필터 + 최신순)
create index if not exists board_posts_category_created_idx
  on public.board_posts (category, created_at desc);

-- 5. profiles 정렬 (랭킹 — pebbles + level 기준)
--    전체 정렬이 Node에서 이뤄지므로 Supabase 조회 자체는 full scan이지만
--    향후 DB-side ORDER BY로 전환 시 사용
create index if not exists profiles_pebbles_level_idx
  on public.profiles (pebbles desc, level desc);
