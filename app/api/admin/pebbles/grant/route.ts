import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

type Body = {
  targetUserId?: string;
  amount?: number;
  reason?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  try {
    const body = (await request.json().catch(() => null)) as Partial<Body> | null;
    const targetUserId = String(body?.targetUserId ?? "").trim();
    const amount = Math.floor(Number(body?.amount));
    const reason = String(body?.reason ?? "").trim() || "운영자 지급";

    if (!UUID_RE.test(targetUserId) || targetUserId === "anon") {
      return NextResponse.json({ ok: false, error: "invalid_targetUserId" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    }

    const result = await adjustPebblesAtomic(targetUserId, amount);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    const svc = createServiceRoleClient();

    // pebble_transactions 에 기록
    await svc.from("pebble_transactions").insert({
      user_id: targetUserId,
      amount,
      balance_after: result.balance,
      type: "admin_grant",
      description: `🎁 운영자 지급 · ${reason}`,
    }).then(() => {/* 실패해도 무시 */});

    // 알림 발송
    const notifMessage = `🎉 축하합니다! 페블이 지급되었습니다\n페블: ${amount.toLocaleString()} P\n사유: ${reason}`;
    await svc.from("notifications").insert({
      user_id: targetUserId,
      message: notifMessage,
      link: null,
      is_read: false,
    }).then(() => {/* 실패해도 무시 */});

    return NextResponse.json({
      ok: true,
      balance: result.balance,
      targetUserId,
      amount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
