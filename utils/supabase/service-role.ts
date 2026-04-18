import { createClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 — **service_role** 키 사용.
 *
 * - Supabase에서 **RLS(행 수준 보안)** 는 `anon` / `authenticated` JWT에 적용되며,
 *   **service_role** 은 RLS를 우회합니다.
 * - 따라서 Next.js API Route에서만 이 클라이언트로 `bets` 등에 INSERT 하면,
 *   일반 사용자 세션으로는 막히던 정책과 무관하게 서버가 안전하게 한 번 더 인증한 뒤 저장할 수 있습니다.
 * - `SUPABASE_SERVICE_ROLE_KEY` 는 **절대** 브라우저·클라이언트 번들에 넣지 마세요.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
