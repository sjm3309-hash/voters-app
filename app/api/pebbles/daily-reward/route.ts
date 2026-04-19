/**
 * POST /api/pebbles/daily-reward
 *
 * 오늘의 출석 보상을 지급합니다.
 * - KST 기준 날짜 비교 (UTC+9)
 * - DB UPDATE ... WHERE last_reward_date != today 를 원자적으로 실행해
 *   동시 요청(race condition)으로 인한 중복 지급을 방지합니다.
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

    // ── 2. 빠른 사전 체크: 이미 오늘 수령 완료 ─────────────
    if (lastDate === today) {
      return NextResponse.json({ ok: true, alreadyClaimed: true, level });
    }

    // ── 3. 원자적 날짜 선점 (race condition 방지) ──────────
    //   last_reward_date != today 인 행만 UPDATE → affected rows 로 중복 방지
    //   동시에 여러 요청이 들어와도 하나만 성공하고 나머지는 0 rows affected
    // last_reward_date != today OR last_reward_date IS NULL 인 행만 업데이트
    // (neq 단독으로는 NULL 행을 매칭하지 않으므로 or 필터 사용)
    const { data: claimRows, error: claimErr } = await svc
      .from("profiles")
      .update({ last_reward_date: today })
      .eq("id", user.id)
      .or(`last_reward_date.neq.${today},last_reward_date.is.null`)
      .select("level");

    if (claimErr) {
      // last_reward_date 컬럼이 없는 경우 (마이그레이션 미적용) → 기존 방식 fallback
      console.warn("[daily-reward] last_reward_date update error (migration missing?):", claimErr.message);
      // 그냥 오류 반환 (보상 미지급)
      return NextResponse.json({ ok: false, error: "migration_required", message: "last_reward_date 컬럼이 필요합니다." }, { status: 500 });
    }

    // 업데이트된 행이 없으면 이미 오늘 다른 요청이 선점한 것
    if (!claimRows || claimRows.length === 0) {
      return NextResponse.json({ ok: true, alreadyClaimed: true, level });
    }

    // ── 4. 선점 성공 → 보상 지급 ──────────────────────────
    const reward = getDailyReward(level);

    const result = await adjustPebblesAtomic(user.id, reward);
    if (!result.ok) {
      // 페블 지급 실패 시 날짜 선점 롤백
      await svc
        .from("profiles")
        .update({ last_reward_date: lastDate })
        .eq("id", user.id);
      return NextResponse.json(
        { ok: false, error: (result as { error: string }).error },
        { status: 500 },
      );
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
