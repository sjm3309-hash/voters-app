import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BetRowPublic } from "@/lib/bets-market-mapper";
import { betRowToFeedWire } from "@/lib/bets-feed-wire";
import { sumOptionStakesByMarketIds, sumPoolsByMarketIds } from "@/lib/bet-history-flavor";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" as const };

/**
 * 로그인 유저가 `bets.user_id`로 개설한 보트만 조회합니다.
 * 정렬: created_at 내림차순 (최신 생성이 위).
 */
export async function GET() {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
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

    const { data: rows, error } = await svc
      .from("bets")
      .select("*")
      .eq("user_id", user.id)
      .order("closing_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500, headers: NO_STORE },
      );
    }

    const rawRows = (rows ?? []) as BetRowPublic[];
    const ids = rawRows.map((r) => r.id).filter(Boolean);
    const [poolBy, stakesByMarket] =
      ids.length > 0
        ? await Promise.all([sumPoolsByMarketIds(svc, ids), sumOptionStakesByMarketIds(svc, ids)])
        : [new Map<string, number>(), new Map<string, Record<string, number>>()];

    const markets = rawRows.map((r) => {
      const pool = poolBy.get(r.id) ?? 0;
      const stakes = stakesByMarket.get(r.id);
      return betRowToFeedWire(r, pool, stakes);
    });

    return NextResponse.json({ ok: true, markets }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: NO_STORE });
  }
}
