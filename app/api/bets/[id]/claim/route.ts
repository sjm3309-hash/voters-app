/**
 * POST /api/bets/[id]/claim
 *
 * 보트 당첨 페블을 서버에서 계산·지급합니다.
 * - DB unique(user_id, market_id) 제약으로 중복 수령 방지
 * - 정산 상태·당첨 선택지·실제 베팅 내역을 서버에서 직접 조회해 계산
 */
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isUuidString } from "@/lib/is-uuid";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { calculateFees, calculateUserPayout } from "@/lib/market-settlement";
import {
  getBetHistoryFlavor,
  betHistoryMarketCol,
  betHistoryOptionCol,
} from "@/lib/bet-history-flavor";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const marketId = rawId?.trim() ?? "";

  if (!marketId || !isUuidString(marketId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  // ── 1. 인증 확인 ────────────────────────────────────────────────────────
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const svc = createServiceRoleClient();

  // ── 2. 보트 상태 확인 (settled 여야 수령 가능) ──────────────────────────
  const { data: market, error: mErr } = await svc
    .from("bets")
    .select("id, status, winning_option_id, user_id")
    .eq("id", marketId)
    .maybeSingle();

  if (mErr || !market) {
    return NextResponse.json({ ok: false, error: "market_not_found" }, { status: 404 });
  }

  const mRow = market as {
    id: string;
    status?: string | null;
    winning_option_id?: string | null;
    user_id?: string | null;
  };

  if (mRow.status !== "settled") {
    return NextResponse.json(
      { ok: false, error: "not_settled", message: "아직 정산되지 않은 보트입니다." },
      { status: 409 },
    );
  }

  const winningOptionId = mRow.winning_option_id ?? "";
  if (!winningOptionId) {
    return NextResponse.json(
      { ok: false, error: "no_winning_option", message: "당첨 선택지가 없습니다." },
      { status: 409 },
    );
  }

  // ── 3. 이미 수령했는지 확인 (DB unique 제약 전 사전 체크) ───────────────
  const { data: existing } = await svc
    .from("bet_claims")
    .select("id")
    .eq("user_id", userId)
    .eq("market_id", marketId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { ok: false, error: "already_claimed", message: "이미 수령한 보상입니다." },
      { status: 409 },
    );
  }

  // ── 4. bet_history에서 실제 베팅 내역 조회 ─────────────────────────────
  const flavor = await getBetHistoryFlavor(svc);
  const marketCol = betHistoryMarketCol(flavor);
  const optionCol = betHistoryOptionCol(flavor);

  const { data: hist, error: hErr } = await svc
    .from("bet_history")
    .select(`user_id, amount, ${optionCol}`)
    .eq(marketCol, marketId);

  if (hErr) {
    return NextResponse.json({ ok: false, error: hErr.message }, { status: 500 });
  }

  const rows = (hist ?? []) as Record<string, unknown>[];

  // 전체 풀 합산 + 당첨 선택지 합산 + 내 당첨 베팅 합산
  let totalPool = 0;
  let totalWinning = 0;
  let myWinning = 0;

  for (const row of rows) {
    const amt = Math.floor(Number(row.amount ?? 0));
    const oid = String(row[optionCol] ?? "").trim();
    const uid = String(row.user_id ?? "").trim();
    if (amt <= 0 || !oid) continue;

    totalPool += amt;
    if (oid === winningOptionId) {
      totalWinning += amt;
      if (uid === userId) myWinning += amt;
    }
  }

  if (myWinning <= 0) {
    return NextResponse.json(
      { ok: false, error: "no_winning_bet", message: "당첨 선택지에 참여한 내역이 없습니다." },
      { status: 400 },
    );
  }

  // ── 5. 배당 계산 (역배당 방지 3단계 시나리오 적용) ─────────────────────
  const { dividendPool, scenario } = calculateFees(totalPool, totalWinning);
  const payout = calculateUserPayout(myWinning, totalWinning, dividendPool);

  if (payout <= 0) {
    return NextResponse.json(
      { ok: false, error: "zero_payout", message: "배당 페블이 0 이하입니다." },
      { status: 400 },
    );
  }

  // ── 6. 페블 지급 ────────────────────────────────────────────────────────
  const result = await adjustPebblesAtomic(userId, payout);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  // ── 7. 수령 기록 (DB unique 제약이 동시 요청도 차단) ────────────────────
  const { error: claimErr } = await svc.from("bet_claims").insert({
    user_id: userId,
    market_id: marketId,
    payout,
  });

  if (claimErr) {
    if (claimErr.code === "23505") {
      // unique violation: 동시 요청으로 이미 insert됨 → 중복 지급 방지를 위해 페블 환수
      await adjustPebblesAtomic(userId, -payout);
      return NextResponse.json(
        { ok: false, error: "already_claimed", message: "동시 수령 요청이 감지되었습니다." },
        { status: 409 },
      );
    }
    // insert 실패해도 페블은 이미 지급 → 로그만 남기고 성공 반환
    console.error("[claim] bet_claims insert failed:", claimErr.message);
  }

  // ── 8. pebble_transactions 기록 ─────────────────────────────────────────
  void svc.from("pebble_transactions").insert({
    user_id: userId,
    amount: payout,
    balance_after: result.balance,
    type: "bet_win",
    description: `🏆 보트 당첨 수령 — 배당 ${payout.toLocaleString()}P`,
  });

  return NextResponse.json({ ok: true, payout, balance: result.balance, scenario });
}
