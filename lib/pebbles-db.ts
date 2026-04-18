import { createServiceRoleClient } from "@/utils/supabase/service-role";

function toDeltaInt(delta: number): number {
  const n = Math.trunc(Number(delta));
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * RPC 미배포·스키마 불일치 시 사용. 동시 요청에서는 레이스 가능하나 관리자 지급 등에는 충분합니다.
 */
async function adjustPebblesViaTable(
  userId: string,
  delta: number,
): Promise<{ ok: true; balance: number } | { ok: false; error: string; code?: string }> {
  const d = toDeltaInt(delta);
  const svc = createServiceRoleClient();

  const { data: row, error: selErr } = await svc
    .from("profiles")
    .select("pebbles")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message ?? String(selErr), code: selErr.code };
  }

  const cur = Math.max(0, Math.floor(Number((row as { pebbles?: unknown } | null)?.pebbles ?? 0)));

  if (!row) {
    const next = Math.max(0, cur + d);
    const { error: insErr } = await svc.from("profiles").insert({ id: userId, pebbles: next });
    if (insErr) {
      return { ok: false, error: insErr.message ?? String(insErr), code: insErr.code };
    }
    return { ok: true, balance: next };
  }

  const next = cur + d;
  if (next < 0) {
    return { ok: false, error: "insufficient_pebbles", code: "insufficient_pebbles" };
  }

  const { error: upErr } = await svc.from("profiles").update({ pebbles: next }).eq("id", userId);
  if (upErr) {
    return { ok: false, error: upErr.message ?? String(upErr), code: upErr.code };
  }
  return { ok: true, balance: next };
}

/**
 * 서비스 롤 전용 — 페블 원자 증감 (profiles.pebbles).
 * 실패 시 insufficient_pebbles / profile_missing 등 메시지.
 */
export async function adjustPebblesAtomic(
  userId: string,
  delta: number,
): Promise<{ ok: true; balance: number } | { ok: false; error: string; code?: string }> {
  const d = toDeltaInt(delta);
  if (!userId || userId === "anon") {
    return { ok: false, error: "invalid_user" };
  }

  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc.rpc("adjust_pebbles_atomic", {
      p_user_id: userId,
      p_delta: d,
    });

    if (error) {
      const msg = error.message ?? String(error);
      if (msg.includes("insufficient_pebbles")) {
        return { ok: false, error: "insufficient_pebbles", code: "insufficient_pebbles" };
      }
      const fb = await adjustPebblesViaTable(userId, d);
      if (fb.ok) return fb;
      return { ok: false, error: fb.error, code: fb.code ?? error.code };
    }

    const balance = Math.max(0, Math.floor(Number(data ?? 0)));
    return { ok: true, balance };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fb = await adjustPebblesViaTable(userId, d);
    if (fb.ok) return fb;
    return { ok: false, error: fb.error ?? msg };
  }
}

/**
 * DB profiles.pebbles 직접 조회 (행 없으면 null).
 * 잔액 API는 행이 없을 때만 bootstrap 호출.
 */
export async function readProfilePebblesFromDb(
  userId: string,
): Promise<{ ok: true; pebbles: number; exists: boolean } | { ok: false; error: string }> {
  if (!userId || userId === "anon") {
    return { ok: false, error: "invalid_user" };
  }
  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("profiles")
      .select("pebbles")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message ?? String(error) };
    }
    if (!data) {
      return { ok: true, pebbles: 0, exists: false };
    }
    const pebbles = Math.max(0, Math.floor(Number((data as { pebbles?: unknown }).pebbles ?? 0)));
    return { ok: true, pebbles, exists: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function bootstrapProfileBalance(
  userId: string,
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  if (!userId || userId === "anon") {
    return { ok: false, error: "invalid_user" };
  }

  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc.rpc("bootstrap_profile_balance", {
      p_user_id: userId,
    });

    if (error) {
      return { ok: false, error: error.message ?? String(error) };
    }

    const balance = Math.max(0, Math.floor(Number(data ?? 0)));
    return { ok: true, balance };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
