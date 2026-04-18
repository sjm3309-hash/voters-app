import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export type PebbleTx = {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  balance: number;
};

const TYPE_LABEL: Record<string, string> = {
  admin_grant: "운영자 지급",
  admin_deduct: "운영자 차감",
  daily_reward: "일일 보상",
  level_up: "레벨업",
  bet_win: "보트 당첨",
  bet_place: "보트 참여",
  like_reward: "좋아요 보상",
  signup_bonus: "가입 보너스",
  welcome_bonus: "웰컴 보너스",
  creator_fee: "창작자 수수료",
  refund: "환불",
};

export function labelForType(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

/**
 * GET /api/admin/users/[id]/pebble-history
 * 특정 유저의 pebble_transactions 내역을 관리자 권한으로 조회합니다.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id: userId } = await context.params;
  if (!userId?.trim()) {
    return NextResponse.json({ ok: false, error: "missing user id" }, { status: 400 });
  }

  try {
    const svc = createServiceRoleClient();

    const { data, error } = await svc
      .from("pebble_transactions")
      .select("id, created_at, type, description, amount, balance_after")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const transactions: PebbleTx[] = ((data ?? []) as {
      id?: string | number;
      created_at?: string | null;
      type?: string | null;
      description?: string | null;
      amount?: number | null;
      balance_after?: number | null;
    }[]).map((r) => ({
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
