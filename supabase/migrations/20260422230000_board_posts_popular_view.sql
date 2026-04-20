-- 인기 게시판용 실시간 점수 View
--
-- hot_score 공식:
--   (조회수 + 댓글수 × 5) / (경과시간(h) + 2)^1.5
--
-- 시간이 지날수록 점수가 자연스럽게 감쇠하므로
-- 최근 글일수록 같은 조회수라도 더 높은 점수를 가진다.

CREATE OR REPLACE VIEW public.board_posts_popular_v AS
SELECT
  *,
  (views + (comment_count * 5))::float
    / POWER(
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 + 2,
        1.5
      ) AS hot_score
FROM public.board_posts;

-- service_role(API 서버)과 인증 유저·익명 유저 모두 읽기 허용
GRANT SELECT ON public.board_posts_popular_v TO anon, authenticated, service_role;
