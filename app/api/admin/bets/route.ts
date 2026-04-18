import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { betRowToMarket, type BetRowPublic } from "@/lib/bets-market-mapper";
import { sortBetFeedRows, type SmartSortMode } from "@/lib/bets-feed-sort";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { sumPoolsByMarketIds } from "@/lib/bet-history-flavor";

/**
 * 운영자 전용 — DB의 **모든** 동기화 보트 (confirmed_at 3일 제한 없음)
 */
const ADMIN_FETCH_CAP = 3000;
const ADMIN_RESPONSE_LIMIT = 2000;

export async function GET(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json(
        { ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" },
        { status: 503 },
      );
    }

    const nowMs = Date.now();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim();
    const subCategory = searchParams.get("sub_category")?.trim();
    const sort = searchParams.get("sort")?.trim();

    let q = supabase
      .from("bets")
      .select(
        "id, title, closing_at, confirmed_at, created_at, category, sub_category, color, status, is_admin_generated, author_name, options",
      );

    if (category) q = q.eq("category", category);
    if (subCategory) q = q.eq("sub_category", subCategory);

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(ADMIN_FETCH_CAP);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 },
      );
    }

    const rawRows = (data ?? []) as BetRowPublic[];
    const ids = rawRows.map((r) => r.id).filter(Boolean);

    const poolBy =
      ids.length > 0 ? await sumPoolsByMarketIds(supabase, ids) : new Map<string, number>();

    const sortMode: SmartSortMode =
      sort === "created_desc" ? "created_desc" : "smart";
    const rows = sortBetFeedRows(rawRows, nowMs, poolBy, sortMode).slice(
      0,
      ADMIN_RESPONSE_LIMIT,
    );

    const markets = rows.map((r) => {
      const m = betRowToMarket(r);
      const row = r as BetRowPublic;
      const createdAt =
        row.created_at && String(row.created_at).trim()
          ? new Date(row.created_at).toISOString()
          : undefined;
      return {
        id: m.id,
        question: m.question,
        category: m.category,
        subCategory: m.subCategory,
        options: m.options,
        totalPool: m.totalPool,
        comments: m.comments,
        endsAt: m.endsAt.toISOString(),
        createdAt,
        resultAt: m.resultAt?.toISOString(),
        accentColor: m.accentColor,
        isOfficial: m.isOfficial,
        officialAuthorName: m.officialAuthorName,
      };
    });

    return NextResponse.json({ ok: true, markets });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
