import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

/** profiles 테이블 기준: 행 수, pebbles 합계 */
export async function GET() {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  try {
    const svc = createServiceRoleClient();

    const { count: profileCount, error: cErr } = await svc
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }

    let totalPebbles = 0;
    const batch = 1000;
    let from = 0;
    for (;;) {
      const { data: rows, error: pErr } = await svc
        .from("profiles")
        .select("pebbles")
        .range(from, from + batch - 1);

      if (pErr) {
        return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
      }
      const chunk = rows ?? [];
      for (const r of chunk as { pebbles?: unknown }[]) {
        totalPebbles += Math.max(0, Math.floor(Number(r.pebbles ?? 0)));
      }
      if (chunk.length < batch) break;
      from += batch;
    }

    return NextResponse.json({
      ok: true,
      profileRowCount: profileCount ?? 0,
      totalPebblesInProfiles: totalPebbles,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
