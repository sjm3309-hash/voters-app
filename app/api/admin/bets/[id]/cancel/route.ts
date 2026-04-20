import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import {
  getBetHistoryFlavor,
  betHistoryMarketCol,
} from "@/lib/bet-history-flavor";
import { CREATE_USER_MARKET_COST } from "@/lib/points-constants";

type HistRow = { user_id?: string | null; amount?: number | null; [key: string]: unknown };

/**
 * POST /api/admin/bets/[id]/cancel
 * 보트를 강제 취소하고 모든 베팅 참여자에게 페블을 환불합니다.
 * 유저가 만든 보트라면 창작자에게도 생성 비용을 환불합니다.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  try {
    const svc = createServiceRoleClient();

    // 1. 보트 조회
    const { data: bet, error: betErr } = await svc
      .from("bets")
      .select("id, status, is_admin_generated, user_id")
      .eq("id", id)
      .maybeSingle();

    if (betErr) return NextResponse.json({ ok: false, error: betErr.message }, { status: 500 });
    if (!bet) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const betRow = bet as { id: string; status?: string | null; is_admin_generated?: boolean; user_id?: string | null };

    const alreadyCancelled = ["cancelled", "void"].includes(
      String(betRow.status ?? "").toLowerCase().trim(),
    );
    if (alreadyCancelled) {
      return NextResponse.json({ ok: false, error: "이미 취소된 보트입니다." }, { status: 400 });
    }

    // 2. bet_history 조회
    const flavor = await getBetHistoryFlavor(svc);
    const marketCol = betHistoryMarketCol(flavor);

    const { data: hist, error: histErr } = await svc
      .from("bet_history")
      .select(`user_id, amount`)
      .eq(marketCol, id);

    if (histErr) return NextResponse.json({ ok: false, error: histErr.message }, { status: 500 });

    // 3. 유저별 환불액 합산
    const refundMap = new Map<string, number>();
    for (const h of ((hist ?? []) as HistRow[])) {
      const uid = h.user_id ? String(h.user_id).trim() : "";
      const amt = Math.floor(Number(h.amount ?? 0));
      if (!uid || uid === "anon" || !Number.isFinite(amt) || amt <= 0) continue;
      refundMap.set(uid, (refundMap.get(uid) ?? 0) + amt);
    }

    // 4. 유저 생성 보트라면 창작자에게 생성 비용 추가 환불
    const isUserCreated = !betRow.is_admin_generated && betRow.user_id;
    if (isUserCreated && betRow.user_id) {
      const creatorId = betRow.user_id;
      refundMap.set(creatorId, (refundMap.get(creatorId) ?? 0) + CREATE_USER_MARKET_COST);
    }

    // 5. 보트 상태 cancelled로 업데이트
    const { error: updateErr } = await svc
      .from("bets")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

    // 6. 환불 처리
    const refundResults: { userId: string; amount: number; ok: boolean; error?: string }[] = [];
    for (const [userId, amount] of refundMap) {
      const r = await adjustPebblesAtomic(userId, amount);
      refundResults.push({ userId, amount, ok: r.ok, error: r.ok ? undefined : r.error });
      if (r.ok) {
        void svc.from("pebble_transactions").insert({
          user_id: userId,
          amount,
          balance_after: r.balance,
          type: "bet_refund",
          description: `↩ 보트 취소 환불 — ${amount.toLocaleString()}P`,
        });
      }
    }

    const succeeded = refundResults.filter((r) => r.ok).length;
    const failed = refundResults.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: true,
      message: `보트가 취소되었습니다. 환불 ${succeeded}명 완료${failed > 0 ? `, ${failed}명 실패` : ""}.`,
      refundResults,
      creatorRefunded: isUserCreated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
