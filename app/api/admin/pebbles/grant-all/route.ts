import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { isAdminEmail } from "@/lib/admin";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

type Body = {
  amount?: number;
  reason?: string;
};

/** public.profiles 에 있는 모든 유저(운영자 이메일 제외)에게 페블 일괄 지급 */
export async function POST(request: Request) {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  try {
    const body = (await request.json().catch(() => null)) as Partial<Body> | null;
    const amount = Math.floor(Number(body?.amount));
    const reason = String(body?.reason ?? "운영자 일괄 지급").slice(0, 200);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    let succeeded = 0;
    let skippedAdmin = 0;
    let failed = 0;
    const batch = 100;
    let from = 0;

    for (;;) {
      const { data: rows, error: qErr } = await svc
        .from("profiles")
        .select("id")
        .range(from, from + batch - 1);

      if (qErr) {
        return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });
      }

      const chunk = rows ?? [];
      if (chunk.length === 0) break;

      for (const row of chunk as { id?: string }[]) {
        const id = row.id;
        if (!id) continue;
        try {
          const { data: udata, error: uerr } = await svc.auth.admin.getUserById(id);
          if (uerr || !udata?.user?.email) {
            failed++;
            continue;
          }
          if (isAdminEmail(udata.user.email)) {
            skippedAdmin++;
            continue;
          }

          const r = await adjustPebblesAtomic(id, amount);
          if (!r.ok) {
            failed++;
            continue;
          }

          succeeded++;

          // pebble_transactions 기록 (실패해도 무시)
          void svc.from("pebble_transactions").insert({
            user_id: id,
            amount,
            balance_after: r.balance,
            type: "admin_grant",
            description: `🎁 운영자 일괄 지급 · ${reason}`,
          });

          // 알림 발송 (실패해도 무시)
          void svc.from("notifications").insert({
            user_id: id,
            message: `🎉 축하합니다! 페블이 지급되었습니다\n금액: ${amount.toLocaleString()} P\n사유: ${reason}`,
            link: null,
            is_read: false,
          });
        } catch {
          failed++;
        }
      }

      if (chunk.length < batch) break;
      from += batch;
    }

    return NextResponse.json({
      ok: true,
      amount,
      reason,
      succeeded,
      skippedAdmin,
      failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
