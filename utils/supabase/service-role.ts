import { createClient } from "@supabase/supabase-js";

/**
 * 서버 전용 — RLS 우회 조회·upsert 등. `SUPABASE_SERVICE_ROLE_KEY` 필수.
 * 클라이언트 번들에 포함하지 마세요.
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
