-- 댓글 소프트 삭제 지원: is_deleted 컬럼 추가
ALTER TABLE public.boat_comments
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
