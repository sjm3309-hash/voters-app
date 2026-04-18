import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export interface DbTransaction {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  balance: number;
}

type TxRow = {
  id?: string | number;
  created_at?: string | null;
  type?: string | null;
  description?: string | null;
  amount?: number | null;
  balance_after?: number | null;
};

/**
 * GET /api/pebbles/history
 * 로그인 유저의 pebble_transactions 조회 (최신 200건)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("pebble_transactions")
      .select("id, created_at, type, description, amount, balance_after")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const transactions: DbTransaction[] = ((data ?? []) as TxRow[]).map((r) => ({
      id: String(r.id ?? ""),
      date: r.created_at ?? new Date().toISOString(),
      type: r.type ?? "other",
      description: r.description ?? "",
      amount: Math.trunc(Number(r.amount ?? 0)),
      balance: Math.max(0, Math.trunc(Number(r.balance_after ?? 0))),
    }));

    return NextResponse.json({ ok: true, transactions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
