import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BetRowPublic } from "@/lib/bets-market-mapper";
import { betRowToFeedWire } from "@/lib/bets-feed-wire";
import {
  getBetHistoryFlavor,
  betHistoryMarketCol,
  sumPoolsByMarketIds,
  sumOptionStakesByMarketIds,
} from "@/lib/bet-history-flavor";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" as const };

/**
 * GET /api/my-participated-bets
 * 로그인 유저가 bet_history에 참여한(베팅한) 보트 목록을 반환합니다.
 * 정렬: closing_at 오름차순 (마감 임박 순).
 */
export async function GET() {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    let svc: ReturnType<typeof createServiceRoleClient>;
    try {
      svc = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json(
        { ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" },
        { status: 503, headers: NO_STORE },
      );
    }

    // 1. 유저가 베팅한 market ID 목록 조회
    const flavor = await getBetHistoryFlavor(svc);
    const marketCol = betHistoryMarketCol(flavor);

    const { data: histRows, error: histErr } = await svc
      .from("bet_history")
      .select(`${marketCol}, amount`)
      .eq("user_id", user.id);

    if (histErr) {
      return NextResponse.json(
        { ok: false, error: histErr.message },
        { status: 500, headers: NO_STORE },
      );
    }

    // 유저별 마켓 ID 및 총 베팅액 집계
    const myStakeByMarket = new Map<string, number>();
    for (const h of (histRows ?? []) as Record<string, unknown>[]) {
      const mid = String(h[marketCol] ?? "").trim();
      const amt = Math.floor(Number(h.amount ?? 0));
      if (!mid || amt <= 0) continue;
      myStakeByMarket.set(mid, (myStakeByMarket.get(mid) ?? 0) + amt);
    }

    const marketIds = [...myStakeByMarket.keys()];
    if (marketIds.length === 0) {
      return NextResponse.json({ ok: true, markets: [] }, { headers: NO_STORE });
    }

    // 2. bets 테이블에서 해당 마켓 정보 조회
    const { data: rows, error: betsErr } = await svc
      .from("bets")
      .select("*")
      .in("id", marketIds)
      .order("closing_at", { ascending: true });

    if (betsErr) {
      return NextResponse.json(
        { ok: false, error: betsErr.message },
        { status: 500, headers: NO_STORE },
      );
    }

    const rawRows = (rows ?? []) as BetRowPublic[];
    const ids = rawRows.map((r) => r.id).filter(Boolean);
    const [poolBy, stakesByMarket] =
      ids.length > 0
        ? await Promise.all([
            sumPoolsByMarketIds(svc, ids),
            sumOptionStakesByMarketIds(svc, ids),
          ])
        : [new Map<string, number>(), new Map<string, Record<string, number>>()];

    const markets = rawRows.map((r) => {
      const pool = poolBy.get(r.id) ?? 0;
      const stakes = stakesByMarket.get(r.id);
      const wire = betRowToFeedWire(r, pool, stakes);
      // 유저 개인 베팅액 추가
      return { ...wire, myStake: myStakeByMarket.get(r.id) ?? 0 };
    });

    return NextResponse.json({ ok: true, markets }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: NO_STORE },
    );
  }
}
