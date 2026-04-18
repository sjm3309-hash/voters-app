import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BetRowPublic } from "@/lib/bets-market-mapper";
import { betRowToFeedWire } from "@/lib/bets-feed-wire";
import { isUuidString } from "@/lib/is-uuid";
import {
  betHistoryMarketCol,
  betHistoryOptionCol,
  getBetHistoryFlavor,
  readOptionIdFromRow,
} from "@/lib/bet-history-flavor";

/** 보트 상세 JSON — 항상 최신 DB 반영 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const trimmed = id?.trim() ?? "";
  if (!trimmed) {
    return NextResponse.json(
      { ok: false, error: "missing id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isUuidString(trimmed)) {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json(
        { ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    // `*` 사용: Supabase에 winning_option_id 등 마이그레이션 전 DB도 조회 가능
    const { data, error } = await supabase
      .from("bets")
      .select("*")
      .eq("id", trimmed)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const row = data as BetRowPublic;
    const flavor = await getBetHistoryFlavor(supabase);
    const marketCol = betHistoryMarketCol(flavor);
    const optionCol = betHistoryOptionCol(flavor);

    const { data: histRows } = await supabase
      .from("bet_history")
      .select(`${optionCol}, amount, user_id`)
      .eq(marketCol, trimmed);

    let pool = 0;
    const optionTotals: Record<string, number> = {};
    let sessionUser: { id: string } | null = null;
    try {
      const authSupabase = await createClient();
      const {
        data: { user },
      } = await authSupabase.auth.getUser();
      sessionUser = user?.id ? { id: user.id } : null;
    } catch {
      /* 쿠키/anon 설정 문제여도 보트 본문은 반환 */
    }
    const myOptionTotals: Record<string, number> = {};

    for (const h of histRows ?? []) {
      const r = h as Record<string, unknown>;
      const a = Math.floor(Number(r.amount ?? 0));
      if (!Number.isFinite(a) || a <= 0) continue;
      pool += a;
      const oid = readOptionIdFromRow(flavor, r);
      if (oid) {
        optionTotals[oid] = (optionTotals[oid] ?? 0) + a;
      }
      if (
        sessionUser?.id &&
        String(r.user_id ?? "").trim() === sessionUser.id &&
        oid
      ) {
        myOptionTotals[oid] = (myOptionTotals[oid] ?? 0) + a;
      }
    }

    const market = betRowToFeedWire(row, pool, optionTotals);
    return NextResponse.json(
      { ok: true, market, optionTotals, myOptionTotals },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
