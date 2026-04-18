-- profiles 테이블: 본인 행 SELECT 허용 (balance API가 서비스롤 없이도 동작하도록)
-- Vercel 환경에서 SUPABASE_SERVICE_ROLE_KEY 없이도 잔액 조회 가능

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 본인 행 읽기 허용
DROP POLICY IF EXISTS "본인 프로필 읽기" ON public.profiles;
CREATE POLICY "본인 프로필 읽기"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 서비스롤 전체 접근 (기존 방식 유지)
DROP POLICY IF EXISTS "서비스롤 전체 접근" ON public.profiles;
CREATE POLICY "서비스롤 전체 접근"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 순위 페이지: 닉네임·레벨·포인트는 공개 조회 허용
DROP POLICY IF EXISTS "공개 순위 조회" ON public.profiles;
CREATE POLICY "공개 순위 조회"
  ON public.profiles
  FOR SELECT
  USING (true);
