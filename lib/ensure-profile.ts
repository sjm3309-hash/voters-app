import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `bets.user_id` 등이 `profiles(id)`를 참조할 때 행이 없으면 INSERT가 실패합니다.
 * 마이그레이션된 `bootstrap_profile_balance`가 있으면 한 번 호출하고,
 * 없거나 실패하면 `profiles`에 최소 행만 넣습니다.
 */
export async function ensureProfileRowExists(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const rpc = await supabase.rpc("bootstrap_profile_balance", { p_user_id: userId });
  if (!rpc.error) return { ok: true };

  const { error: insErr } = await supabase.from("profiles").insert({ id: userId });
  if (!insErr) return { ok: true };
  if (insErr.code === "23505") return { ok: true };
  const m = insErr.message ?? "";
  if (/duplicate|unique/i.test(m)) return { ok: true };
  return { ok: false, message: insErr.message };
}
