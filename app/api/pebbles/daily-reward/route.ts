/**
 * POST /api/pebbles/daily-reward
 *
 * 오늘의 출석 보상을 지급합니다.
 * - KST 기준 날짜 비교 (UTC+9)
 * - last_reward_date == 오늘이면 already_claimed 반환
 * - 아니면 현재 level 에 맞는 dailyReward 지급
 */
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { getDailyReward } from "@/lib/levelConfig";

/** KST(UTC+9) 기준 오늘 날짜를 'YYYY-MM-DD' 형식으로 반환 */
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

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
    const today = todayKST();

    // ── 1. 현재 프로필 읽기 ───────────────────────────────
    const { data: profile, error: readErr } = await svc
      .from("profiles")
      .select("level, last_reward_date")
      .eq("id", user.id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
    }

    const level = Math.max(1, Math.min(56, Math.floor(Number((profile as { level?: unknown } | null)?.level ?? 1))));
    const lastDate = typeof (profile as { last_reward_date?: unknown } | null)?.last_reward_date === "string"
      ? (profile as { last_reward_date: string }).last_reward_date
      : null;

    // ── 2. 이미 오늘 수령했으면 스킵 ─────────────────────
    if (lastDate === today) {
      return NextResponse.json({ ok: true, alreadyClaimed: true, level });
    }

    // ── 3. 보상 지급 ─────────────────────────────────────
    const reward = getDailyReward(level);

    const result = await adjustPebblesAtomic(user.id, reward);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: (result as { error: string }).error },
        { status: 500 },
      );
    }

    // ── 4. last_reward_date 업데이트 ─────────────────────
    const { error: upErr } = await svc
      .from("profiles")
      .update({ last_reward_date: today })
      .eq("id", user.id);

    if (upErr) {
      // 날짜 업데이트 실패해도 페블은 이미 지급 → 롤백하지 않음
      console.error("[daily-reward] last_reward_date update failed:", upErr.message);
    }

    // ── 5. 거래 내역 기록 ────────────────────────────────
    void svc.from("pebble_transactions").insert({
      user_id: user.id,
      amount: reward,
      balance_after: result.balance,
      type: "daily_reward",
      description: `📅 Lv.${level} 일일 출석 보상 — ${reward.toLocaleString()}P`,
    });

    return NextResponse.json({
      ok: true,
      alreadyClaimed: false,
      reward,
      level,
      newBalance: result.balance,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
