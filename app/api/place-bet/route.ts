import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { checkUserModeration } from "@/lib/moderation-check";

const MIN_BET_AMOUNT = 100;
const BET_STEP = 100;

type BetLeg = { optionId: string; amount: number };
type Body = { marketId: string; bets: BetLeg[] };

function normalizeBetLegs(raw: unknown): { legs: BetLeg[]; total: number; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { legs: [], total: 0, error: "bets_required" };
  }
  const byOption = new Map<string, number>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const optionId = String((item as { optionId?: unknown }).optionId ?? "").trim();
    const floored = Math.floor(Number((item as { amount?: unknown }).amount));
    if (!optionId || !Number.isFinite(floored) || floored <= 0) continue;
    const stepped = Math.floor(floored / BET_STEP) * BET_STEP;
    if (stepped < MIN_BET_AMOUNT) continue;
    byOption.set(optionId, (byOption.get(optionId) ?? 0) + stepped);
  }
  const legs: BetLeg[] = [];
  let total = 0;
  for (const [optionId, amount] of byOption) {
    legs.push({ optionId, amount });
    total += amount;
  }
  if (legs.length === 0 || total <= 0) return { legs: [], total: 0, error: "no_valid_bets" };
  return { legs, total };
}

export async function POST(request: Request) {
  try {
    // ── 1. 인증 ──────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // ── 2. 요청 파싱 ─────────────────────────────────────────
    const body = (await request.json().catch(() => null)) as Partial<Body> | null;
    const marketId = String(body?.marketId ?? "").trim();
    const normalized = normalizeBetLegs(body?.bets);

    if (!marketId || normalized.error === "bets_required") {
      return NextResponse.json(
        { ok: false, error: "invalid_request", message: "참여 정보가 없습니다." },
        { status: 400 },
      );
    }
    if (normalized.legs.length === 0 || normalized.error === "no_valid_bets") {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_bets",
          message: `각 선택지에 ${MIN_BET_AMOUNT.toLocaleString()} 페블 이상, ${BET_STEP.toLocaleString()} 단위로 입력해 주세요.`,
        },
        { status: 400 },
      );
    }

    // ── 3. 제재 확인 ─────────────────────────────────────────
    const mod = await checkUserModeration(user.id);
    if (mod.blocked) {
      return NextResponse.json({ ok: false, error: mod.reason, message: mod.message }, { status: 403 });
    }

    // ── 4. Service Role 클라이언트 ───────────────────────────
    let svc: ReturnType<typeof createServiceRoleClient>;
    try {
      svc = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json({ ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" }, { status: 503 });
    }

    // ── 5. 창작자 베팅 차단 ──────────────────────────────────
    const { data: creatorCheck } = await svc
      .from("bets")
      .select("user_id")
      .eq("id", marketId)
      .maybeSingle();

    if (creatorCheck && (creatorCheck as { user_id?: string }).user_id === user.id) {
      return NextResponse.json(
        { ok: false, error: "creator_cannot_bet", message: "보트 창작자는 자신의 보트에 참여할 수 없습니다." },
        { status: 403 },
      );
    }

    // ── 6. 단일 RPC 호출 (모든 검증·차감·기록을 DB 함수가 원자적으로 처리) ──
    const { data: rpcData, error: rpcError } = await svc.rpc("place_bets_secure", {
      p_user_id: user.id,
      p_boat_id: marketId,
      p_bets: normalized.legs.map((leg) => ({
        option_id: leg.optionId,
        amount: leg.amount,
      })),
    });

    if (rpcError) {
      // PostgreSQL RAISE EXCEPTION 메시지를 그대로 클라이언트에 전달
      const msg = rpcError.message ?? "참여 처리 중 오류가 발생했습니다.";
      const isClientError =
        msg.includes("insufficient") ||
        msg.includes("limit") ||
        msg.includes("closed") ||
        msg.includes("finalized") ||
        msg.includes("invalid") ||
        msg.includes("too_early");
      return NextResponse.json(
        { ok: false, error: rpcError.code ?? "rpc_error", message: msg },
        { status: isClientError ? 400 : 500 },
      );
    }

    // ── 7. 성공 응답 ─────────────────────────────────────────
    const result = rpcData as {
      remaining_balance?: number;
      option_totals?: Record<string, number>;
      my_option_totals?: Record<string, number>;
    } | null;

    const balanceAfter = result?.remaining_balance ?? null;

    // ── 8. pebble_transactions 기록 (fire-and-forget) ────────
    if (typeof balanceAfter === "number") {
      void svc.from("pebble_transactions").insert({
        user_id: user.id,
        amount: -normalized.total,
        balance_after: balanceAfter,
        type: "bet_place",
        description: `🎯 보트 참여 — ${normalized.total.toLocaleString()}P`,
      });
    }

    return NextResponse.json({
      ok: true,
      remainingBalance: balanceAfter,
      optionTotals: result?.option_totals ?? {},
      myOptionTotals: result?.my_option_totals ?? {},
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
