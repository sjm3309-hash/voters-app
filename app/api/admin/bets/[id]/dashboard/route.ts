import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { betRowToMarket, type BetRowPublic } from "@/lib/bets-market-mapper";
import { requireAdminJson } from "@/app/api/admin/_auth";

type BetHistoryRow = {
  market_id?: string;
  amount?: number | null;
  option_id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

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

    const { data: betData, error: betErr } = await supabase
      .from("bets")
      .select(
        "id, title, closing_at, confirmed_at, created_at, category, sub_category, color, status, is_admin_generated, author_name, options",
      )
      .eq("id", id)
      .maybeSingle();

    if (betErr) {
      return NextResponse.json(
        { ok: false, error: betErr.message, code: betErr.code },
        { status: 500 },
      );
    }
    if (!betData) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    const row = betData as BetRowPublic;
    const m = betRowToMarket(row);
    const createdAt =
      row.created_at && String(row.created_at).trim()
        ? new Date(row.created_at).toISOString()
        : undefined;

    const market = {
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

    const { data: hist, error: hErr } = await supabase
      .from("bet_history")
      .select("*")
      .eq("market_id", id)
      .order("created_at", { ascending: false });

    if (hErr) {
      return NextResponse.json(
        { ok: false, error: hErr.message, code: hErr.code },
        { status: 500 },
      );
    }

    const history = (hist ?? []) as BetHistoryRow[];
    let totalAmount = 0;
    const optionTotals = new Map<string, number>();
    const userIds = new Set<string>();

    for (const h of history) {
      const amt = Number(h.amount ?? 0);
      if (Number.isFinite(amt)) totalAmount += amt;
      const oid = h.option_id != null ? String(h.option_id) : "";
      if (oid) optionTotals.set(oid, (optionTotals.get(oid) ?? 0) + amt);
      const uid = h.user_id != null ? String(h.user_id).trim() : "";
      if (uid) userIds.add(uid);
    }

    return NextResponse.json({
      ok: true,
      market,
      history,
      stats: {
        betCount: history.length,
        totalAmount,
        uniqueBettors: userIds.size,
        optionTotals: Object.fromEntries(optionTotals),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
