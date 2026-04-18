/**
 * POST /api/pebbles/level-up
 *
 * 레벨업을 원자적으로 처리합니다.
 * 1. DB에서 현재 pebbles / level 읽기
 * 2. 비용 검증 (페블 충분 + level < 56)
 * 3. adjustPebblesAtomic 으로 원자적 차감
 * 4. profiles.level += 1 (CAS 체크 포함)
 * 5. pebble_transactions 기록
 */
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { getUpgradeCost } from "@/lib/levelConfig";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const svc = createServiceRoleClient();

    // ── 1. 현재 상태 읽기 ─────────────────────────────────
    const { data: profile, error: readErr } = await svc
      .from("profiles")
      .select("pebbles, level")
      .eq("id", user.id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
    }

    const currentLevel = Math.max(1, Math.min(56, Math.floor(Number((profile as { level?: unknown }).level ?? 1))));
    const currentPebbles = Math.max(0, Math.floor(Number((profile as { pebbles?: unknown }).pebbles ?? 0)));

    if (currentLevel >= 56) {
      return NextResponse.json({ ok: false, error: "already_max_level" }, { status: 400 });
    }

    const cost = getUpgradeCost(currentLevel);
    if (!isFinite(cost)) {
      return NextResponse.json({ ok: false, error: "already_max_level" }, { status: 400 });
    }

    if (currentPebbles < cost) {
      return NextResponse.json(
        {
          ok: false,
          error: "insufficient_pebbles",
          message: `페블이 부족합니다. 필요: ${cost.toLocaleString()}P / 보유: ${currentPebbles.toLocaleString()}P`,
          required: cost,
          have: currentPebbles,
        },
        { status: 400 },
      );
    }

    // ── 2. 원자적 페블 차감 ───────────────────────────────
    const deduct = await adjustPebblesAtomic(user.id, -cost);
    if (!deduct.ok) {
      const msg = (deduct as { error: string }).error;
      if (msg === "insufficient_pebbles") {
        return NextResponse.json(
          { ok: false, error: "insufficient_pebbles", message: "페블이 부족합니다." },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    const newBalance = deduct.balance;
    const newLevel = currentLevel + 1;

    // ── 3. 레벨 업데이트 (CAS: level = currentLevel 일 때만) ──
    const { error: lvErr } = await svc
      .from("profiles")
      .update({ level: newLevel })
      .eq("id", user.id)
      .eq("level", currentLevel);

    if (lvErr) {
      // 레벨 업데이트 실패 시 페블 환불
      await adjustPebblesAtomic(user.id, cost);
      return NextResponse.json({ ok: false, error: `level_update_failed: ${lvErr.message}` }, { status: 500 });
    }

    // ── 4. 거래 내역 기록 ────────────────────────────────
    void svc.from("pebble_transactions").insert({
      user_id: user.id,
      amount: -cost,
      balance_after: newBalance,
      type: "level_up",
      description: `⬆️ 레벨업 (Lv.${currentLevel} → Lv.${newLevel}) — ${cost.toLocaleString()}P 사용`,
    });

    return NextResponse.json({
      ok: true,
      newLevel,
      newBalance,
      cost,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
